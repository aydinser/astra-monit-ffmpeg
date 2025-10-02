const express = require("express");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");

const app = express();
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Function to get local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) {
        return alias.address;
      }
    }
  }
  return "127.0.0.1"; // Fallback to localhost
}

const ASTRA_DIR = "/etc/astra";
const BIN_DIR = "/usr/local/bin";
const MONIT_CONF = "/etc/monit/conf.d/transcoding.conf";
const DVB_DIR = "/dev/dvb";

// Utility helpers
async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch (err) {
    await fs.mkdir(dir, { recursive: true });
  }
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-]/g, "_");
}

async function listLuaFiles() {
  try {
    await ensureDir(ASTRA_DIR);
    const files = await fs.readdir(ASTRA_DIR);
    return files.filter((f) => f.endsWith(".lua"));
  } catch (e) {
    return [];
  }
}

async function listUsedAdapters() {
  const luaFiles = await listLuaFiles();
  const used = new Set();
  for (const f of luaFiles) {
    try {
      const content = await fs.readFile(path.join(ASTRA_DIR, f), "utf8");
      // regex: adapter = <number>
      const m = content.match(/adapter\s*=\s*([0-9]+)/g);
      if (m) {
        for (const mm of m) {
          const n = mm.match(/([0-9]+)/);
          if (n) used.add(parseInt(n[1], 10));
        }
      }
      // also cover adapter_<n> pattern (if present)
      const m2 = f.match(/adapter[_\-]?([0-9]+)/i);
      if (m2) used.add(parseInt(m2[1], 10));
    } catch (e) {
      // ignore
    }
  }
  return Array.from(used);
}

async function listSystemAdapters() {
  try {
    const items = await fs.readdir(DVB_DIR);
    // items like adapter0 adapter1 ...
    return items.filter((i) => /^adapter\d+$/.test(i));
  } catch (e) {
    return [];
  }
}

// Read /usr/local/bin to know which binaries exist
async function listBinaries() {
  try {
    const items = await fs.readdir(BIN_DIR);
    return items;
  } catch (e) {
    return [];
  }
}

// Create lua content based on user input
function makeLuaContent({ name, adapter, frequency, symbol, pol }) {
  // tp format: "<freq>:<POL>:<symbol>"
  // pol -> "H" or "V"
  const polChar = pol === "H" ? "H" : "V";
  const tp = `${frequency}:${polChar}:${symbol}`;
  return `adapter_${adapter} = dvb_tune({
    type = "S",
    adapter = ${adapter},
    tp = "${tp}",
    lnb = "9750:10600:11700",
})\n\n-- Adapter name: ${name}\n`;
}

// Append monit block
async function appendMonitBlock(name) {
  const block = `check process ${name} with pidfile /var/run/${name}.pid
        start program = "/bin/sh -c 'ulimit -n 65536; /usr/local/bin/${name} --no-stdout --pid /var/run/${name}.pid /etc/astra/${name}.lua'"
        stop program = "/bin/sh -c 'kill \`cat /var/run/${name}.pid\`'"
        group astra
`;
  try {
    await ensureDir(path.dirname(MONIT_CONF));

    // Dosyanın mevcut içeriğini kontrol et ve düzenle
    let fileContent = "";
    if (fsSync.existsSync(MONIT_CONF)) {
      fileContent = await fs.readFile(MONIT_CONF, "utf8");

      // Mevcut içeriği yeni bir Writable stream olarak açalım
      await fs.writeFile(
        MONIT_CONF,
        fileContent + "\n\n\n\n\n" + block + "\n\n\n\n\n",
        "utf8"
      );
    } else {
      await fs.writeFile(MONIT_CONF, block + "\n\n\n\n\n", "utf8");
    }
    return true;
  } catch (e) {
    throw new Error("Could not append to monit conf: " + e.message);
  }
}

// Fix existing monit config file to ensure proper spacing
async function fixMonitConfigSpacing() {
  try {
    if (!fsSync.existsSync(MONIT_CONF)) return;

    // Dosyayı oku
    const content = await fs.readFile(MONIT_CONF, "utf8");

    // "group astra" veya "group ffmpeg_streams" ifadelerinden sonra yeterli boşluk yok ise düzelt
    let fixedContent = content
      .replace(/group astra\s*check/g, "group astra\n\n\n\n\ncheck")
      .replace(
        /group ffmpeg_streams\s*check/g,
        "group ffmpeg_streams\n\n\n\n\ncheck"
      );

    // Düzeltilmiş içeriği yaz
    if (fixedContent !== content) {
      await fs.writeFile(MONIT_CONF, fixedContent, "utf8");
      console.log("Monit config file spacing fixed");

      // Monit servisini yeniden başlat
      try {
        execFileSync("service", ["monit", "restart"], { stdio: "ignore" });
      } catch (e) {
        console.error("Failed to restart monit after fixing config:", e);
      }
    }
  } catch (e) {
    console.error("Error fixing monit config spacing:", e);
  }
}

async function removeMonitBlock(name) {
  try {
    const txt = await fs.readFile(MONIT_CONF, "utf8");
    // remove block starting with "check process name with pidfile ..." up to blank line(s)
    const regex = new RegExp(
      `check process ${name} with pidfile[\\s\\S]*?group astra\\s*\\n`,
      "g"
    );
    const out = txt.replace(regex, "");
    await fs.writeFile(MONIT_CONF, out, "utf8");
    return true;
  } catch (e) {
    // if file doesn't exist, ignore
    return false;
  }
}

// API: get frontend data (adapters available, used, lua files, bins)
app.get("/api/state", async (req, res) => {
  try {
    const sysAdapters = await listSystemAdapters(); // adapter0...
    const usedAdapters = await listUsedAdapters(); // [0,1,...]
    const luaFiles = await listLuaFiles();
    const bins = await listBinaries();
    // build adapters object with used boolean and associated lua if any
    const adapters = sysAdapters.map((name) => {
      const n = parseInt(name.replace("adapter", ""), 10);
      const used = usedAdapters.includes(n);
      const luaFor = luaFiles.find((l) => {
        // open file and check adapter number association? Simpler: check lua content
        return false;
      });
      return { name, number: n, used };
    });
    // read lua file metadata (names)
    const luaMeta = [];
    for (const f of luaFiles) {
      try {
        const content = await fs.readFile(path.join(ASTRA_DIR, f), "utf8");
        luaMeta.push({ file: f, content });
      } catch (e) {}
    }
    res.json({ adapters, luaFiles: luaMeta, bins });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create adapter
app.post("/api/adapters", async (req, res) => {
  /*
    body: {
      name: "myadapter",
      adapter: 5,         // number
      frequency: "12520",
      symbol: "27500",
      pol: "V" | "H"
    }
  */
  try {
    const { name, adapter, frequency, symbol, pol } = req.body;
    if (
      !name ||
      typeof adapter === "undefined" ||
      !frequency ||
      !symbol ||
      !pol
    ) {
      return res.status(400).json({ error: "Eksik parametre" });
    }
    const safe = safeFilename(name);
    const luaPath = path.join(ASTRA_DIR, `${safe}.lua`);
    const binSrc = path.join(BIN_DIR, "astra"); // assuming original binary is 'astra'
    const binDst = path.join(BIN_DIR, safe);

    const luaContent = makeLuaContent({
      name: safe,
      adapter,
      frequency,
      symbol,
      pol,
    });

    // write lua file
    await ensureDir(ASTRA_DIR);
    await fs.writeFile(luaPath, luaContent, { mode: 0o755 });

    // copy binary if original exists; if not, attempt to copy any executable named 'astra'
    if (fsSync.existsSync(binSrc)) {
      await fs.copyFile(binSrc, binDst);
      await fs.chmod(binDst, 0o755);
    } else {
      // create a small wrapper script that execs /usr/bin/astra if exists, else placeholder
      const wrapper = `#!/bin/sh
# wrapper for ${safe}
# Try to execute /usr/local/bin/astra if present
if [ -x "/usr/local/bin/astra" ]; then
  exec /usr/local/bin/astra "$@"
else
  echo "astra binary not found" >&2
  exit 1
fi
`;
      await fs.writeFile(binDst, wrapper, { mode: 0o755 });
    }

    // append to monit conf
    await appendMonitBlock(safe);

    return res.json({ ok: true, name: safe });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete adapter
app.delete("/api/adapters/:name", async (req, res) => {
  try {
    const name = safeFilename(req.params.name);
    const luaPath = path.join(ASTRA_DIR, `${name}.lua`);
    const binPath = path.join(BIN_DIR, name);
    // kill process if pidfile exists
    const pidFile = `/var/run/${name}.pid`;
    try {
      if (fsSync.existsSync(pidFile)) {
        const pid = (await fs.readFile(pidFile, "utf8")).trim();
        if (pid) {
          try {
            process.kill(parseInt(pid, 10));
          } catch (err) {
            /* ignore */
          }
        }
        try {
          await fs.unlink(pidFile);
        } catch (e) {}
      }
    } catch (e) {}

    // remove files
    try {
      await fs.unlink(luaPath);
    } catch (e) {}
    try {
      await fs.unlink(binPath);
    } catch (e) {}

    // remove monit block
    try {
      await removeMonitBlock(name);
    } catch (e) {}

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Add channel to adapter lua file
app.post("/api/adapters/:name/channels", async (req, res) => {
  /*
   body: { channelName, pnr, port, path }
  效果 -> append make_channel({...}) to /etc/astra/<name>.lua
  */
  try {
    const name = safeFilename(req.params.name);
    const { channelName, pnr, port, path: urlPath, adapterNum } = req.body;
    if (!channelName || !pnr || !port || !urlPath)
      return res.status(400).json({ error: "Eksik parametre" });
    const luaPath = path.join(ASTRA_DIR, `${name}.lua`);
    if (!fsSync.existsSync(luaPath))
      return res.status(404).json({ error: "Adapter lua bulunamadi" });

    // Use adapter_X as input reference for the channel with the actual adapter number
    const input = `dvb://adapter_${adapterNum}#pnr=${pnr}`;
    const output = `http://0.0.0.0:${port}${
      urlPath.startsWith("/") ? urlPath : "/" + urlPath
    }`;

    const channelBlock = `
make_channel({
    name = "${channelName}",
    input = {
        "${input}"
    },
    output = {
        "${output}"
    }
})
`;

    await fs.appendFile(luaPath, channelBlock, "utf8");
    await fs.chmod(luaPath, 0o755);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Edit channel in adapter lua file
app.put("/api/adapters/:name/channels/:channelName", async (req, res) => {
  try {
    const adapterName = safeFilename(req.params.name);
    const oldChannelName = req.params.channelName;
    const {
      newName,
      pnr,
      port,
      path: urlPath,
      adapterNum: requestAdapterNum,
    } = req.body;

    if (!newName || !pnr || !port || !urlPath)
      return res.status(400).json({ error: "Eksik parametre" });

    const luaPath = path.join(ASTRA_DIR, `${adapterName}.lua`);
    if (!fsSync.existsSync(luaPath))
      return res.status(404).json({ error: "Adapter lua bulunamadi" });

    // Read the entire lua file
    let content = await fs.readFile(luaPath, "utf8");

    // Use adapter number from request if available, otherwise extract from the Lua file content
    let adapterNum;
    if (requestAdapterNum) {
      adapterNum = requestAdapterNum;
    } else {
      const adapterMatch = content.match(/adapter\s*=\s*([0-9]+)/);
      adapterNum = adapterMatch ? adapterMatch[1] : "0";
    }

    // Find the channel block to replace
    const channelRegex = new RegExp(
      `make_channel\\([\\s\\S]*?name\\s*=\\s*"${oldChannelName}"[\\s\\S]*?\\}\\s*\\)`,
      "g"
    );

    // Create new channel block
    const input = `dvb://adapter_${adapterNum}#pnr=${pnr}`;
    const output = `http://0.0.0.0:${port}${
      urlPath.startsWith("/") ? urlPath : "/" + urlPath
    }`;

    const newChannelBlock = `
make_channel({
    name = "${newName}",
    input = {
        "${input}"
    },
    output = {
        "${output}"
    }
})`;

    // Replace the channel block
    const updatedContent = content.replace(channelRegex, newChannelBlock);

    if (content === updatedContent) {
      return res.status(404).json({ error: "Kanal bulunamadı" });
    }

    // Write back the updated content
    await fs.writeFile(luaPath, updatedContent, { mode: 0o755 });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete channel from adapter lua file
app.delete("/api/adapters/:name/channels/:channelName", async (req, res) => {
  try {
    const adapterName = safeFilename(req.params.name);
    const channelName = req.params.channelName;

    const luaPath = path.join(ASTRA_DIR, `${adapterName}.lua`);
    if (!fsSync.existsSync(luaPath))
      return res.status(404).json({ error: "Adapter lua bulunamadi" });

    // Read the entire lua file
    let content = await fs.readFile(luaPath, "utf8");

    // Find the channel block to delete
    const channelRegex = new RegExp(
      `\\s*make_channel\\([\\s\\S]*?name\\s*=\\s*"${channelName}"[\\s\\S]*?\\}\\s*\\)\\s*`,
      "g"
    );

    // Remove the channel block
    const updatedContent = content.replace(channelRegex, "\n");

    if (content === updatedContent) {
      return res.status(404).json({ error: "Kanal bulunamadı" });
    }

    // Write back the updated content
    await fs.writeFile(luaPath, updatedContent, { mode: 0o755 });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Get available (unused) adapters for editing
app.get("/api/adapters/:name/available", async (req, res) => {
  try {
    const name = safeFilename(req.params.name);
    const luaPath = path.join(ASTRA_DIR, `${name}.lua`);
    if (!fsSync.existsSync(luaPath))
      return res.status(404).json({ error: "Adapter lua bulunamadi" });

    // Get current adapter number for this lua file
    const content = await fs.readFile(luaPath, "utf8");
    const currentAdapterMatch = content.match(
      /adapter_(\d+)\s*=|adapter\s*=\s*(\d+)/
    );
    const currentAdapter = currentAdapterMatch
      ? parseInt(currentAdapterMatch[1] || currentAdapterMatch[2], 10)
      : null;

    const sysAdapters = await listSystemAdapters(); // adapter0, adapter1, ...
    const usedAdapters = await listUsedAdapters(); // [0,1,2,...]

    // Find available adapters (exclude currently used ones, but include current adapter of this lua file)
    const availableAdapters = sysAdapters
      .map((name) => {
        const num = parseInt(name.replace("adapter", ""), 10);
        const isUsed = usedAdapters.includes(num);
        const isCurrent = num === currentAdapter;

        return {
          number: num,
          name: name,
          available: !isUsed || isCurrent, // Available if not used, or if it's the current adapter
          current: isCurrent,
        };
      })
      .filter((adapter) => adapter.available);

    return res.json({
      availableAdapters,
      currentAdapter,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Edit adapter (simple: replace lua content or update fields)
// For brevity, implement an endpoint that replaces the lua file content with new tuning params
app.put("/api/adapters/:name", async (req, res) => {
  try {
    const name = safeFilename(req.params.name);
    const { adapter, frequency, symbol, pol } = req.body;
    const luaPath = path.join(ASTRA_DIR, `${name}.lua`);
    if (!fsSync.existsSync(luaPath))
      return res.status(404).json({ error: "Adapter lua bulunamadi" });

    // read existing content to preserve channels - we will keep lines after the initial adapter_... block
    const content = await fs.readFile(luaPath, "utf8");

    // Extract the old adapter number from the existing content
    const oldAdapterMatch = content.match(/adapter_(\d+)\s*=/);
    const oldAdapterNum = oldAdapterMatch ? oldAdapterMatch[1] : null;

    // strip first adapter_* block and replace with new one, preserving anything after two newlines
    const restIndex = content.indexOf("\n\n");
    const rest = restIndex >= 0 ? content.slice(restIndex + 2) : "";

    // If adapter number changed, update all channel input references
    let updatedRest = rest;
    if (oldAdapterNum && oldAdapterNum !== adapter) {
      // Update all dvb://adapter_X references in channel inputs
      const oldAdapterPattern = new RegExp(
        `dvb://adapter_${oldAdapterNum}#`,
        "g"
      );
      updatedRest = rest.replace(
        oldAdapterPattern,
        `dvb://adapter_${adapter}#`
      );
    }

    const newStart = makeLuaContent({ name, adapter, frequency, symbol, pol });
    const newContent = newStart + "\n" + updatedRest;

    await fs.writeFile(luaPath, newContent, { mode: 0o755 });

    // Update the adapter references in the bin path if the adapter number has changed
    const binPath = path.join(BIN_DIR, name);
    if (fsSync.existsSync(binPath)) {
      // If we wanted to update the binary, we would do it here
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// API to get adapter signal strength (simulated)
app.get("/api/adapters/:name/signal", async (req, res) => {
  try {
    const name = safeFilename(req.params.name);
    // In a real implementation, you would query the actual DVB adapter for signal info
    // Here we're just generating random values to simulate a live adapter

    const signal = {
      name,
      signalStrength: Math.floor(Math.random() * 50) + 50, // 50-100%
      qualityLevel: Math.floor(Math.random() * 30) + 70, // 70-100%
      ber: Math.floor(Math.random() * 10), // Bit Error Rate
      unc: Math.floor(Math.random() * 5), // Uncorrected Blocks
      status: "locked", // or "unlocked"
    };

    return res.json(signal);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// API to get channel statistics (simulated)
app.get("/api/adapters/:name/channels/stats", async (req, res) => {
  try {
    const name = safeFilename(req.params.name);
    const luaPath = path.join(ASTRA_DIR, `${name}.lua`);

    if (!fsSync.existsSync(luaPath)) {
      return res.status(404).json({ error: "Adapter lua bulunamadı" });
    }

    // Read lua file to extract channel names
    const content = await fs.readFile(luaPath, "utf8");
    const channelNames = [];
    const channelRegex = /make_channel\(\s*{\s*name\s*=\s*"([^"]+)"/g;
    let match;

    while ((match = channelRegex.exec(content)) !== null) {
      channelNames.push(match[1]);
    }

    // Generate random stats for each channel
    const channelStats = channelNames.map((channelName) => {
      // Randomly decide if the channel is active (80% chance)
      const isActive = Math.random() < 0.8;

      return {
        channelName,
        isActive,
        bitrate: isActive ? Math.floor(Math.random() * 7000) + 1000 : 0, // 1000-8000 Kbps if active
        viewers: isActive ? Math.floor(Math.random() * 50) : 0, // 0-50 viewers
        uptime: isActive ? Math.floor(Math.random() * 24) + 1 : 0, // 1-24 hours of uptime
        status: isActive ? "streaming" : "offline",
      };
    });

    return res.json(channelStats);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// API to get server IP address
app.get("/api/serverip", (req, res) => {
  try {
    const ip = getLocalIp();
    return res.json({ ip });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// API to get active transcodes
app.get("/api/transcodes", async (req, res) => {
  try {
    const serverIp = getLocalIp();
    const result = {};

    // Check for transcodes.json state file first
    const transcodesFilePath = path.join(ASTRA_DIR, "transcodes.json");
    if (fsSync.existsSync(transcodesFilePath)) {
      try {
        const content = await fs.readFile(transcodesFilePath, "utf8");
        const savedTranscodes = JSON.parse(content);

        // Copy saved transcodes to result, but validate they still exist
        for (const [channelName, data] of Object.entries(savedTranscodes)) {
          const scriptPath = `/var/ffmpeg/${channelName}.sh`;

          // Only include if the script file still exists
          if (fsSync.existsSync(scriptPath)) {
            result[channelName] = {
              quality: data.quality,
              rtmpUrl: data.rtmpUrl,
            };
          }
        }
      } catch (err) {
        console.error("Failed to parse transcodes state file:", err);
      }
    }

    // Fallback: Check /var/ffmpeg directory for transcode scripts
    // This will find any scripts that might not be in our state file
    try {
      await ensureDir("/var/ffmpeg");
      const files = await fs.readdir("/var/ffmpeg");

      // Only get the .sh files with channel names
      const channelScripts = files.filter(
        (f) =>
          f.endsWith(".sh") &&
          !["sdkanal.sh", "hdkanal.sh", "ultrahd.sh"].includes(f)
      );

      // For each channel script, get the transcode details if not already in result
      for (const scriptName of channelScripts) {
        const channelName = scriptName.replace(".sh", "");

        // Skip if we already have this channel in the result from state file
        if (result[channelName]) continue;

        // Read the script content to determine quality
        try {
          const scriptContent = await fs.readFile(
            `/var/ffmpeg/${scriptName}`,
            "utf8"
          );

          // Extract quality from the script content
          let quality = "unknown";
          if (scriptContent.includes("sdkanal.sh")) {
            quality = "sd";
          } else if (scriptContent.includes("hdkanal.sh")) {
            quality = "hd";
          } else if (scriptContent.includes("ultrahd.sh")) {
            quality = "ultrahd";
          }

          result[channelName] = {
            quality,
            rtmpUrl: `rtmp://${serverIp}:1935/live/${channelName}`,
          };
        } catch (err) {
          // Skip if we can't read this file
          console.error(`Failed to read script: ${scriptName}`, err);
        }
      }
    } catch (err) {
      // /var/ffmpeg might not exist in development environment
      console.error("Failed to read /var/ffmpeg directory:", err);
    }

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// API for transcoding
// API endpoint to stop an active transcode
app.delete("/api/transcode/:channel", async (req, res) => {
  try {
    const channelName = safeFilename(req.params.channel);
    const scriptPath = `/var/ffmpeg/${channelName}.sh`;
    const binPath = path.join(BIN_DIR, channelName); // /usr/local/bin içindeki kanal dosyası

    // Check if script exists
    if (!fsSync.existsSync(scriptPath)) {
      return res.status(404).json({ error: "Transcode not found" });
    }

    // Stop the process via monit
    try {
      execFileSync("monit", ["stop", channelName], { stdio: "ignore" });
    } catch (e) {
      console.error(`Failed to stop ${channelName} via monit:`, e);
      // Continue anyway
    }

    // Remove the script file
    await fs.unlink(scriptPath);

    // /usr/local/bin içindeki kanal dosyasını da sil
    try {
      if (fsSync.existsSync(binPath)) {
        await fs.unlink(binPath);
        console.log(`Removed binary file: ${binPath}`);
      }
    } catch (e) {
      console.error(`Failed to remove binary file ${binPath}:`, e);
      // Continue anyway
    }

    // Remove from monit configuration
    try {
      const monitConfPath = MONIT_CONF;
      if (fsSync.existsSync(monitConfPath)) {
        let monitConfig = await fs.readFile(monitConfPath, "utf8");

        // Channel bloğunu standart yapıya göre tespit et
        const channelBlockRegex = new RegExp(
          `check\\s+process\\s+${channelName}\\s+with\\s+pidfile[\\s\\S]*?group\\s+ffmpeg_streams\\s*`,
          "g"
        );

        // Bloğu bul
        const matches = monitConfig.match(channelBlockRegex);

        if (matches && matches.length > 0) {
          console.log(`Found and removing monit config for ${channelName}`);
          monitConfig = monitConfig.replace(channelBlockRegex, "");

          // Boş satırları temizle
          monitConfig = monitConfig.replace(/\n{3,}/g, "\n\n");

          await fs.writeFile(monitConfPath, monitConfig, "utf8");

          // Monit servisini yeniden başlat
          try {
            // Önce syntax kontrolü yap
            execFileSync("monit", ["-t"], { stdio: "pipe" });

            // Sonra yeniden başlat
            execFileSync("service", ["monit", "restart"], { stdio: "ignore" });
            console.log("Monit restarted successfully");
          } catch (e) {
            console.error("Failed to restart monit:", e.message);
            // Continue anyway
          }
        } else {
          console.log(`No monit configuration found for ${channelName}`);
        }
      }
    } catch (e) {
      console.error("Failed to update monit configuration:", e);
      // Continue anyway
    }

    // Update transcodes state
    try {
      const transcodesFilePath = path.join(ASTRA_DIR, "transcodes.json");
      if (fsSync.existsSync(transcodesFilePath)) {
        const content = await fs.readFile(transcodesFilePath, "utf8");
        let transcodes = JSON.parse(content);

        // Remove this channel
        delete transcodes[channelName];

        // Save updated state
        await fs.writeFile(
          transcodesFilePath,
          JSON.stringify(transcodes, null, 2),
          "utf8"
        );
      }
    } catch (e) {
      console.error("Failed to update transcodes state:", e);
      // Continue anyway
    }

    // Try to remove the PID file
    try {
      if (fsSync.existsSync(`/var/run/${channelName}.pid`)) {
        await fs.unlink(`/var/run/${channelName}.pid`);
      }
    } catch (e) {
      console.error("Failed to remove PID file:", e);
      // Continue anyway
    }

    return res.json({
      ok: true,
      message: `Transcode stopped for ${channelName}`,
    });
  } catch (e) {
    console.error("Error stopping transcode:", e);
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/transcode/:adapter/:channel/:quality", async (req, res) => {
  try {
    const adapterName = safeFilename(req.params.adapter);
    const channelName = safeFilename(req.params.channel);
    const quality = safeFilename(req.params.quality);

    // Quality parametresi sd, hd veya ultrahd olmalı
    if (!["sd", "hd", "ultrahd"].includes(quality.toLowerCase())) {
      return res
        .status(400)
        .json({ error: "Invalid quality. Use sd, hd, or ultrahd." });
    }

    // Create /var/ffmpeg directory if it doesn't exist
    await ensureDir("/var/ffmpeg");

    // Get channel information from lua file
    const luaPath = path.join(ASTRA_DIR, `${adapterName}.lua`);
    if (!fsSync.existsSync(luaPath)) {
      return res.status(404).json({ error: "Adapter lua file not found" });
    }

    const luaContent = await fs.readFile(luaPath, "utf8");

    // Extract channel info
    const channelRegex = new RegExp(
      `name\\s*=\\s*"${channelName}"[\\s\\S]*?output\\s*=\\s*{\\s*"([^"]+)"`,
      "m"
    );
    const outputMatch = luaContent.match(channelRegex);

    if (!outputMatch) {
      return res.status(404).json({ error: "Channel not found in adapter" });
    }

    // Extract port and path from output URL
    const outputUrl = outputMatch[1];
    const portMatch = outputUrl.match(/:(\d+)/);
    const pathMatch = outputUrl.match(/\d+(\/.+?)(?:$|")/);

    if (!portMatch || !pathMatch) {
      return res.status(400).json({ error: "Invalid channel output format" });
    }

    const port = portMatch[1];
    const urlPath = pathMatch[1];

    // Get server IP
    const serverIp = getLocalIp();

    // Create transcoding script
    const scriptPath = `/var/ffmpeg/${channelName}.sh`;
    const input = `http://${serverIp}:${port}${urlPath}`;
    const output = `rtmp://${serverIp}:1935/live/${channelName}`;
    const transcodeQuality = quality.toLowerCase();

    // Transcode script içeriği
    const scriptContent = `#!/bin/bash
PATH=/usr/local/bin
chanel="${channelName}"
input="${input}"
output="${output}"
/var/ffmpeg/${transcodeQuality}kanal.sh $chanel $input $output
`;

    // Write the script file
    await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

    // Copy ffmpeg binary to a named instance
    const ffmpegBinPath = path.join(BIN_DIR, channelName);
    if (!fsSync.existsSync(ffmpegBinPath)) {
      try {
        // Copy ffmpeg binary
        await fs.copyFile(path.join(BIN_DIR, "ffmpeg"), ffmpegBinPath);
        await fs.chmod(ffmpegBinPath, 0o755);
      } catch (e) {
        console.error("Failed to copy ffmpeg binary:", e);
        // Continue anyway as the main ffmpeg binary might be used instead
      }
    }

    // Monit için izleme yapılandırması - standart yapı
    const monitConfig = `check process ${channelName} with pidfile "/var/run/${channelName}.pid"
    start program = "/bin/bash /var/ffmpeg/${channelName}.sh"
    stop program = "/bin/kill \`cat /var/run/${channelName}.pid\`"
    if cpu usage < 1% for 5 cycles then restart
    if not exist then restart
    if 5 restarts within 5 cycles then timeout
    group ffmpeg_streams
`;

    // Check if this channel is already in the monit config
    let existingMonitConfig = "";
    try {
      await ensureDir(path.dirname(MONIT_CONF));
      if (fsSync.existsSync(MONIT_CONF)) {
        existingMonitConfig = await fs.readFile(MONIT_CONF, "utf8");
      }
    } catch (e) {
      // Ignore errors, will create new config
    }

    // Önce var olan yapılandırmayı temizle (kanal zaten var olabilir)
    try {
      if (
        existingMonitConfig &&
        existingMonitConfig.includes(`process ${channelName} with pidfile`)
      ) {
        // Mevcut yapılandırmayı temizle
        const channelBlockRegex = new RegExp(
          `check\\s+process\\s+${channelName}\\s+with\\s+pidfile[\\s\\S]*?group\\s+ffmpeg_streams(\\s*\\n){0,10}`,
          "g"
        );
        existingMonitConfig = existingMonitConfig.replace(
          channelBlockRegex,
          ""
        );
        // Boş satırları temizle
        existingMonitConfig = existingMonitConfig.replace(/\n{3,}/g, "\n\n");
      }
    } catch (e) {
      console.error("Error cleaning existing monit config:", e);
    }

    // Yeni yapılandırmayı ekle
    try {
      if (existingMonitConfig) {
        await fs.writeFile(
          MONIT_CONF,
          existingMonitConfig + "\n\n" + monitConfig + "\n\n",
          "utf8"
        );
      } else {
        await fs.writeFile(MONIT_CONF, monitConfig + "\n\n", "utf8");
      }
      console.log(`Added monit config for ${channelName}`);
    } catch (e) {
      console.error("Error writing monit config:", e);
      throw e;
    }

    // Restart monit
    try {
      // Önce syntax kontrolü yap
      execFileSync("monit", ["-t"], { stdio: "pipe" });

      // Sonra yeniden başlat
      execFileSync("service", ["monit", "restart"], { stdio: "ignore" });
      console.log("Monit restarted successfully");
    } catch (e) {
      console.error("Failed to restart monit:", e.message);
      // Continue anyway as this might be a development environment
    }

    // Update active transcodes state
    try {
      const transcodesFilePath = path.join(ASTRA_DIR, "transcodes.json");
      let transcodes = {};

      // Try to load existing transcodes state
      if (fsSync.existsSync(transcodesFilePath)) {
        try {
          const content = await fs.readFile(transcodesFilePath, "utf8");
          transcodes = JSON.parse(content);
        } catch (e) {
          console.error("Failed to parse transcodes state, starting fresh:", e);
        }
      }

      // Update with new transcode info
      transcodes[channelName] = {
        quality: transcodeQuality,
        rtmpUrl: output,
        adapterName,
        timestamp: Date.now(),
      };

      // Save updated state
      await fs.writeFile(
        transcodesFilePath,
        JSON.stringify(transcodes, null, 2),
        "utf8"
      );
    } catch (e) {
      console.error("Failed to update transcodes state:", e);
      // Continue anyway as this is not critical
    }

    return res.json({
      ok: true,
      rtmp: output,
      message: `Transcoding started for ${channelName} with ${quality} quality`,
    });
  } catch (e) {
    console.error("Transcoding error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Server başlangıcında mevcut monit yapılandırma dosyasını düzelt
fixMonitConfigSpacing().catch((err) => {
  console.error("Failed to fix monit config:", err);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Astra panel listening on ${PORT}`);
});
