// app.js - Completely redesigned for new UI
(async function () {
  // Cache DOM elements
  const adaptersContainer = document.getElementById("adaptersContainer");
  const refreshBtn = document.getElementById("refreshBtn");
  const adapterFormModal = document.getElementById("adapterFormModal");
  const channelModal = document.getElementById("channelModal");
  const createAdapterForm = document.getElementById("createAdapterForm");
  const channelForm = document.getElementById("channelForm");

  // Global state
  let activeTranscodes = {}; // Store active transcodes information

  // Server IP for channel URLs
  let serverIp = "192.168.1.165"; // Default fallback

  // Try to get the actual server IP and active transcodes
  try {
    const ipResponse = await fetch("/api/serverip");
    const ipData = await ipResponse.json();
    if (ipData && ipData.ip) {
      serverIp = ipData.ip;
    }

    // Get active transcodes
    const transcodesResponse = await fetch("/api/transcodes");
    const transcodesData = await transcodesResponse.json();
    if (transcodesData) {
      activeTranscodes = transcodesData;
      console.log("Loaded active transcodes:", activeTranscodes);
    }
  } catch (error) {
    console.log("Could not get server data, using defaults", error);
  }

  // Modal handling
  const openAdapterFormBtn = document.getElementById("openAdapterFormBtn");
  const closeAdapterFormBtn = document.getElementById("closeAdapterFormBtn");
  const closeChannelModal = document.getElementById("closeChannelModal");

  // Modal event listeners
  openAdapterFormBtn.addEventListener("click", () => {
    adapterFormModal.classList.remove("hidden");
  });

  closeAdapterFormBtn.addEventListener("click", () => {
    adapterFormModal.classList.add("hidden");
  });

  closeChannelModal.addEventListener("click", () => {
    channelModal.classList.add("hidden");
  });

  // Close modals when clicking outside
  adapterFormModal.addEventListener("click", (e) => {
    if (e.target === adapterFormModal) {
      adapterFormModal.classList.add("hidden");
    }
  });

  channelModal.addEventListener("click", (e) => {
    if (e.target === channelModal) {
      channelModal.classList.add("hidden");
    }
  });

  // Load state from server
  async function loadState() {
    try {
      // Get system state
      const response = await fetch("/api/state");
      const data = await response.json();

      // Also refresh active transcodes
      try {
        const transcodesResponse = await fetch("/api/transcodes");
        const transcodesData = await transcodesResponse.json();
        if (transcodesData) {
          activeTranscodes = transcodesData;
          console.log("Refreshed active transcodes:", activeTranscodes);
        }
      } catch (transcodeError) {
        console.error("Error loading transcodes:", transcodeError);
      }

      // Populate adapter select
      populateAdapterSelect(data.adapters);

      // Render adapters
      renderAdapters(data.luaFiles);

      // Start real-time updates
      setupRealTimeUpdates();

      return data;
    } catch (error) {
      console.error("Error loading state:", error);
      showErrorMessage("Veri yüklenirken hata oluştu. Lütfen tekrar deneyin.");
    }
  }

  // Populate adapter select dropdown
  function populateAdapterSelect(adapters) {
    const adapterNumber = document.getElementById("adapterNumber");
    adapterNumber.innerHTML = "";

    const available = adapters.filter((a) => !a.used).map((a) => a.number);

    if (available.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Kullanılabilir adapter yok";
      adapterNumber.appendChild(opt);
    } else {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Adapter seçin";
      adapterNumber.appendChild(empty);

      for (const n of available) {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = `adapter${n}`;
        adapterNumber.appendChild(opt);
      }
    }
  }

  // Render adapters and their channels
  function renderAdapters(luaFiles) {
    adaptersContainer.innerHTML = "";

    if (!luaFiles || luaFiles.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "col-span-full text-center p-10 text-gray-400";
      emptyMessage.innerHTML = `
        <div class="flex flex-col items-center py-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <p>Henüz oluşturulmuş adapter bulunmuyor.</p>
          <p class="text-sm text-gray-500 mt-2">Yeni adapter oluşturmak için yukarıdaki "Yeni Adapter Ekle" butonunu kullanın.</p>
        </div>
      `;
      adaptersContainer.appendChild(emptyMessage);
      return;
    }

    // Create adapter cards
    for (const lua of luaFiles) {
      const adapterCard = createAdapterCard(lua);
      adaptersContainer.appendChild(adapterCard);
    }
  }

  // Create a single adapter card
  function createAdapterCard(lua) {
    const template = document.getElementById("adapter-card-template");
    const card = template.content
      .cloneNode(true)
      .querySelector(".adapter-card");

    // Extract adapter info from lua file
    const name = lua.file.replace(".lua", "");
    const adapterMatch = lua.content.match(/adapter\s*=\s*([0-9]+)/);
    const adapterNum = adapterMatch ? adapterMatch[1] : "?";

    // Extract tp parameter: "freq:pol:symbol"
    const tpMatch = lua.content.match(/tp\s*=\s*"([^"]+)"/);
    let freq = "?",
      symbol = "?",
      pol = "?";

    if (tpMatch) {
      const tpParts = tpMatch[1].split(":");
      if (tpParts.length >= 3) {
        freq = tpParts[0] || "?";
        pol = tpParts[1] || "?";
        symbol = tpParts[2] || "?";
      }
    }

    // Set adapter info
    card.querySelector(".adapter-title").textContent = name;
    card.querySelector(
      ".adapter-details"
    ).textContent = `adapter${adapterNum} | ${freq} MHz | ${symbol} SR | ${pol} Pol`;

    // Store data for later use
    card.dataset.adapterName = name;
    card.dataset.adapterNum = adapterNum;
    card.dataset.freq = freq;
    card.dataset.symbol = symbol;
    card.dataset.pol = pol;

    // Add channels
    const channelsContainer = card.querySelector(".channels-container");
    addChannelsToAdapter(channelsContainer, lua.content, name, adapterNum);

    // Set up adapter buttons
    setupAdapterButtons(card, name, adapterNum, freq, symbol, pol);

    return card;
  }

  // Add channels to adapter card
  function addChannelsToAdapter(
    container,
    luaContent,
    adapterName,
    adapterNum
  ) {
    // Extract channels from lua content
    const makeChannelBlocks =
      luaContent.match(/make_channel\(\s*\{[\s\S]*?\}\s*\)/g) || [];

    if (makeChannelBlocks.length === 0) {
      const emptyText = document.createElement("div");
      emptyText.className = "text-xs text-slate-400 p-2 text-center italic";
      emptyText.textContent = "Henüz kanal yok";
      container.appendChild(emptyText);
      return;
    }

    // Helper function to extract value from channel block
    function extractValue(block, key) {
      const regex = new RegExp(`${key}\\s*=\\s*"([^"]+)"`);
      const match = block.match(regex);
      return match ? match[1] : "";
    }

    // Process each channel
    for (const block of makeChannelBlocks) {
      const channelName = extractValue(block, "name");

      // Extract input and output
      const inputMatch = block.match(/input\s*=\s*\{\s*"([^"]+)"/);
      const outputMatch = block.match(/output\s*=\s*\{\s*"([^"]+)"/);

      const inputPath = inputMatch ? inputMatch[1] : "";
      const outputPath = outputMatch ? outputMatch[1] : "";

      // Extract PNR from input
      const pnrMatch = inputPath.match(/pnr=(\d+)/);
      const pnr = pnrMatch ? pnrMatch[1] : "";

      // Extract port and path from output
      const portMatch = outputPath.match(/:(\d+)/);
      const port = portMatch ? portMatch[1] : "";

      const pathMatch = outputPath.match(/\d+(\/.+?)(?:$|")/);
      const path = pathMatch ? pathMatch[1] : "";

      // Create channel item
      addChannelItem(container, {
        name: channelName,
        pnr: pnr,
        port: port,
        path: path,
        output: outputPath,
        adapterName: adapterName,
        adapterNum: adapterNum,
      });
    }
  }

  // Add a single channel item
  function addChannelItem(container, channel) {
    const template = document.getElementById("channel-item-template");
    const channelItem = template.content
      .cloneNode(true)
      .querySelector(".channel-item");

    // Set channel info
    channelItem.querySelector(".channel-name").textContent = channel.name;

    // Format the URL to show server IP
    const url = `http://${serverIp}:${channel.port}${channel.path}`;

    // Create HTTP URL container with copy button
    const httpUrlContainer = document.createElement("div");
    httpUrlContainer.className =
      "flex items-center p-1 pl-2 pr-2 bg-gray-100 rounded border border-gray-200";

    // URL text element
    const urlText = document.createElement("div");
    urlText.className = "channel-url flex-1";
    urlText.textContent = url;

    // Copy button
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-http-url ml-2 text-gray-500 hover:text-blue-600";
    copyBtn.title = "URL'yi Kopyala";
    copyBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
      </svg>
    `;

    // Copy functionality
    copyBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      navigator.clipboard.writeText(url).then(() => {
        // Show a mini tooltip
        const miniTip = document.createElement("div");
        miniTip.className =
          "fixed z-50 p-1 bg-black text-white text-xs rounded shadow-lg";
        miniTip.textContent = "Kopyalandı!";
        miniTip.style.top =
          window.scrollY + event.target.getBoundingClientRect().top - 20 + "px";
        miniTip.style.left =
          event.target.getBoundingClientRect().left - 20 + "px";
        document.body.appendChild(miniTip);

        setTimeout(() => {
          document.body.removeChild(miniTip);
        }, 1500);
      });
    });

    // Add elements to container
    httpUrlContainer.appendChild(urlText);
    httpUrlContainer.appendChild(copyBtn);

    // Replace original URL element
    const originalUrlElement = channelItem.querySelector(".channel-url");
    if (originalUrlElement) {
      originalUrlElement.replaceWith(httpUrlContainer);
    }

    // Store channel data
    channelItem.dataset.channelName = channel.name;
    channelItem.dataset.pnr = channel.pnr;
    channelItem.dataset.port = channel.port;
    channelItem.dataset.path = channel.path;
    channelItem.dataset.adapterName = channel.adapterName;
    channelItem.dataset.adapterNum = channel.adapterNum;

    // Set up channel buttons
    setupChannelButtons(channelItem, channel);

    // Set up transcoding buttons
    setupTranscodingButtons(channelItem);

    // Add bitrate element
    const bitrateEl = document.createElement("div");
    bitrateEl.className = "channel-bitrate";
    bitrateEl.textContent = "0 Kbit/s";
    const urlContainer =
      channelItem.querySelector(".channel-url").parentElement;
    urlContainer.insertAdjacentElement("beforebegin", bitrateEl);

    container.appendChild(channelItem);
  }

  // Set up adapter buttons (edit, delete, add channel)
  function setupAdapterButtons(card, name, adapterNum, freq, symbol, pol) {
    // Edit adapter
    card.querySelector(".edit-btn").addEventListener("click", () => {
      showEditAdapterModal(name, adapterNum, freq, symbol, pol);
    });

    // Delete adapter
    card.querySelector(".delete-btn").addEventListener("click", async () => {
      if (!confirm(`${name} adaptörünü silmek istediğinizden emin misiniz?`))
        return;

      try {
        const response = await fetch(
          `/api/adapters/${encodeURIComponent(name)}`,
          {
            method: "DELETE",
          }
        );

        const data = await response.json();
        if (data.ok) {
          card.remove();
          if (adaptersContainer.children.length === 0) {
            loadState(); // Reload to show empty state
          }
        } else {
          showErrorMessage(
            `Adaptör silinirken hata: ${data.error || "Bilinmeyen hata"}`
          );
        }
      } catch (error) {
        showErrorMessage("İşlem sırasında bir hata oluştu");
      }
    });

    // Add channel
    card.querySelector(".add-channel-btn").addEventListener("click", () => {
      showAddChannelModal(name, adapterNum);
    });
  }

  // Set up channel buttons (edit, delete)
  function setupChannelButtons(channelItem, channel) {
    // Edit channel
    channelItem
      .querySelector(".edit-channel-btn")
      .addEventListener("click", () => {
        showEditChannelModal(
          channel.adapterName,
          channel.adapterNum,
          channel.name,
          channel.pnr,
          channel.port,
          channel.path
        );
      });

    // Delete channel
    channelItem
      .querySelector(".delete-channel-btn")
      .addEventListener("click", async () => {
        if (
          !confirm(
            `${channel.name} kanalını silmek istediğinizden emin misiniz?`
          )
        )
          return;

        try {
          const response = await fetch(
            `/api/adapters/${encodeURIComponent(
              channel.adapterName
            )}/channels/${encodeURIComponent(channel.name)}`,
            { method: "DELETE" }
          );

          const data = await response.json();
          if (data.ok) {
            channelItem.remove();

            // Check if this was the last channel
            const channelsContainer = channelItem.parentNode;
            if (!channelsContainer.querySelector(".channel-item")) {
              const emptyText = document.createElement("div");
              emptyText.className =
                "text-xs text-slate-400 p-2 text-center italic";
              emptyText.textContent = "Henüz kanal yok";
              channelsContainer.appendChild(emptyText);
            }
          } else {
            showErrorMessage(
              `Kanal silinirken hata: ${data.error || "Bilinmeyen hata"}`
            );
          }
        } catch (error) {
          showErrorMessage("İşlem sırasında bir hata oluştu");
        }
      });
  }

  // Set up transcoding buttons
  function setupTranscodingButtons(channelItem) {
    const buttons = channelItem.querySelectorAll(".transcode-btn");
    if (!buttons.length) return;

    const adapterName = channelItem.dataset.adapterName;
    const channelName = channelItem.dataset.channelName;

    // Check if this channel has active transcode
    if (activeTranscodes[channelName]) {
      const activeTranscode = activeTranscodes[channelName];
      const activeQuality = activeTranscode.quality;
      const rtmpUrl = activeTranscode.rtmpUrl;

      // Mark the active button
      const activeButton = channelItem.querySelector(
        `.transcode-btn[data-quality="${activeQuality}"]`
      );
      if (activeButton) {
        activeButton.classList.add("active");
      }

      // Add RTMP URL display
      let rtmpUrlContainer = channelItem.querySelector(".rtmp-url-container");
      if (!rtmpUrlContainer) {
        // Create a container similar to HTTP URL container
        rtmpUrlContainer = document.createElement("div");
        rtmpUrlContainer.className =
          "rtmp-url-container flex items-center mt-2 mb-2 p-1 pl-2 pr-2 bg-gray-100 rounded border border-gray-200";

        // Find the right place to insert - after http URL container
        const urlContainer =
          channelItem.querySelector(".channel-url").parentElement;
        if (urlContainer) {
          urlContainer.insertAdjacentElement("afterend", rtmpUrlContainer);
        } else {
          channelItem.querySelector(".min-w-0").appendChild(rtmpUrlContainer);
        }

        // Create RTMP URL text element
        const rtmpText = document.createElement("div");
        rtmpText.className = "rtmp-url flex-1";
        rtmpText.style.fontFamily = "monospace";
        rtmpText.style.fontSize = "10px";
        rtmpText.style.color = "#7c3aed";
        rtmpText.textContent = rtmpUrl;

        // Create copy button
        const copyBtn = document.createElement("button");
        copyBtn.className =
          "copy-rtmp-btn ml-2 text-gray-500 hover:text-purple-600";
        copyBtn.title = "RTMP URL'yi Kopyala";
        copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
        `;

        // Create delete/stop button
        const stopBtn = document.createElement("button");
        stopBtn.className =
          "stop-transcode-btn ml-2 text-gray-500 hover:text-red-600";
        stopBtn.title = "Transcoding'i Durdur";
        stopBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        `;

        // Append elements to container
        rtmpUrlContainer.appendChild(rtmpText);
        rtmpUrlContainer.appendChild(copyBtn);
        rtmpUrlContainer.appendChild(stopBtn);

        // Add click event to the copy button
        copyBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          // Doğrudan rtmpUrl değişkenini kullanıyoruz
          navigator.clipboard.writeText(rtmpUrl).then(() => {
            // Show a mini tooltip
            const miniTip = document.createElement("div");
            miniTip.className =
              "fixed z-50 p-1 bg-black text-white text-xs rounded shadow-lg";
            miniTip.textContent = "Kopyalandı!";
            miniTip.style.top =
              window.scrollY +
              event.target.getBoundingClientRect().top -
              20 +
              "px";
            miniTip.style.left =
              event.target.getBoundingClientRect().left - 20 + "px";
            document.body.appendChild(miniTip);

            setTimeout(() => {
              document.body.removeChild(miniTip);
            }, 1500);
          });
        });

        // Add click event to the stop button
        stopBtn.addEventListener("click", async (event) => {
          event.stopPropagation();

          if (
            confirm(
              `"${channelName}" kanalının transcodingini durdurmak istediğinizden emin misiniz?`
            )
          ) {
            try {
              // Show stopping indicator
              const originalContent = stopBtn.innerHTML;
              stopBtn.innerHTML = `<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>`;

              const resp = await fetch(
                `/api/transcode/${encodeURIComponent(channelName)}`,
                {
                  method: "DELETE",
                }
              );
              const data = await resp.json();

              if (data.ok) {
                // Remove the RTMP URL container
                if (rtmpUrlContainer.parentNode) {
                  rtmpUrlContainer.parentNode.removeChild(rtmpUrlContainer);
                }

                // Remove active state from all buttons
                buttons.forEach((b) => b.classList.remove("active"));

                // Show a mini tooltip
                const miniTip = document.createElement("div");
                miniTip.className =
                  "fixed z-50 p-1 bg-black text-white text-xs rounded shadow-lg";
                miniTip.textContent = "Transcoding durduruldu";
                miniTip.style.top =
                  window.scrollY +
                  event.target.getBoundingClientRect().top -
                  20 +
                  "px";
                miniTip.style.left =
                  event.target.getBoundingClientRect().left - 20 + "px";
                document.body.appendChild(miniTip);

                // Remove the dataset attributes
                delete channelItem.dataset.activeTranscode;
                delete channelItem.dataset.rtmpUrl;

                setTimeout(() => {
                  document.body.removeChild(miniTip);
                }, 1500);
              } else {
                stopBtn.innerHTML = originalContent;
                alert(
                  "Transcoding durdurulamadı: " + (data.error || "bilinmeyen")
                );
              }
            } catch (e) {
              alert("Transcoding durdurma isteği başarısız: " + e.message);
            }
          }
        });
      } else {
        // Eğer container zaten varsa, sadece içeriği güncelleyelim
        const rtmpText = rtmpUrlContainer.querySelector(".rtmp-url");
        if (rtmpText) {
          rtmpText.textContent = rtmpUrl;
        }
      }

      // We don't need to store these in dataset anymore as we're using direct variables
      // Keep them for backwards compatibility but they're not used for copying
      channelItem.dataset.activeTranscode = activeQuality;
      channelItem.dataset.rtmpUrl = rtmpUrl;

      // Add click event to the copy button
      rtmpUrlContainer
        .querySelector(".copy-rtmp-btn")
        .addEventListener("click", (event) => {
          event.stopPropagation();
          // Directly use the rtmpUrl variable instead of dataset property
          const rtmpUrlToUse = activeTranscode.rtmpUrl || rtmpUrl;
          navigator.clipboard.writeText(rtmpUrlToUse).then(() => {
            // Show a mini tooltip
            const miniTip = document.createElement("div");
            miniTip.className =
              "fixed z-50 p-1 bg-black text-white text-xs rounded shadow-lg";
            miniTip.textContent = "Kopyalandı!";
            miniTip.style.top =
              window.scrollY +
              event.target.getBoundingClientRect().top -
              20 +
              "px";
            miniTip.style.left =
              event.target.getBoundingClientRect().left - 20 + "px";
            document.body.appendChild(miniTip);

            setTimeout(() => {
              document.body.removeChild(miniTip);
            }, 1500);
          });
        });

      // Add click event to the stop button
      rtmpUrlContainer
        .querySelector(".stop-transcode-btn")
        .addEventListener("click", async (event) => {
          event.stopPropagation();

          if (
            confirm(
              `"${channelName}" kanalının transcodingini durdurmak istediğinizden emin misiniz?`
            )
          ) {
            try {
              // Show stopping indicator
              const stopBtn = event.currentTarget;
              const originalContent = stopBtn.innerHTML;
              stopBtn.innerHTML = `<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>`;

              const resp = await fetch(
                `/api/transcode/${encodeURIComponent(channelName)}`,
                {
                  method: "DELETE",
                }
              );
              const data = await resp.json();

              if (data.ok) {
                // Remove the RTMP URL container
                if (rtmpUrlContainer.parentNode) {
                  rtmpUrlContainer.parentNode.removeChild(rtmpUrlContainer);
                }

                // Remove active state from all buttons
                buttons.forEach((b) => b.classList.remove("active"));

                // Show a mini tooltip
                const miniTip = document.createElement("div");
                miniTip.className =
                  "fixed z-50 p-1 bg-black text-white text-xs rounded shadow-lg";
                miniTip.textContent = "Transcoding durduruldu";
                miniTip.style.top =
                  window.scrollY +
                  event.target.getBoundingClientRect().top -
                  20 +
                  "px";
                miniTip.style.left =
                  event.target.getBoundingClientRect().left - 20 + "px";
                document.body.appendChild(miniTip);

                // Remove the dataset attributes
                delete channelItem.dataset.activeTranscode;
                delete channelItem.dataset.rtmpUrl;

                setTimeout(() => {
                  document.body.removeChild(miniTip);
                }, 1500);
              } else {
                stopBtn.innerHTML = originalContent;
                alert(
                  "Transcoding durdurulamadı: " + (data.error || "bilinmeyen")
                );
              }
            } catch (e) {
              alert("Transcoding durdurma isteği başarısız: " + e.message);
            }
          }
        });
    }

    buttons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const quality = btn.getAttribute("data-quality");

        // Clear active state from all buttons in this channel
        buttons.forEach((b) => b.classList.remove("active"));

        // Show processing state
        const originalContent = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> İşleniyor...`;
        btn.disabled = true;

        try {
          const resp = await fetch(
            `/api/transcode/${encodeURIComponent(
              adapterName
            )}/${encodeURIComponent(channelName)}/${encodeURIComponent(
              quality
            )}`,
            { method: "POST" }
          );
          const data = await resp.json();

          if (data.ok) {
            // Restore original content and add active class
            btn.innerHTML = originalContent;
            btn.disabled = false;
            btn.classList.add("active");

            // Show tooltip with RTMP URL
            const tooltip = document.createElement("div");
            tooltip.className =
              "fixed z-50 p-2 bg-black text-white text-xs rounded shadow-lg";
            tooltip.style.top =
              window.scrollY + btn.getBoundingClientRect().top - 40 + "px";
            tooltip.style.left = btn.getBoundingClientRect().left + "px";
            tooltip.textContent = `Stream başlatıldı: ${data.rtmp}`;
            document.body.appendChild(tooltip);

            // Add or update the RTMP URL in the channel item
            let rtmpUrlContainer = channelItem.querySelector(
              ".rtmp-url-container"
            );

            if (!rtmpUrlContainer) {
              // Create a container similar to HTTP URL container
              rtmpUrlContainer = document.createElement("div");
              rtmpUrlContainer.className =
                "rtmp-url-container flex items-center mt-2 mb-2 p-1 pl-2 pr-2 bg-gray-100 rounded border border-gray-200";

              // Find the right place to insert - after http URL container
              const urlContainer =
                channelItem.querySelector(".channel-url").parentElement;
              if (urlContainer) {
                urlContainer.insertAdjacentElement(
                  "afterend",
                  rtmpUrlContainer
                );
              } else {
                channelItem
                  .querySelector(".min-w-0")
                  .appendChild(rtmpUrlContainer);
              }

              // Create RTMP URL text element
              const rtmpText = document.createElement("div");
              rtmpText.className = "rtmp-url flex-1";
              rtmpText.style.fontFamily = "monospace";
              rtmpText.style.fontSize = "10px";
              rtmpText.style.color = "#7c3aed";
              rtmpText.textContent = data.rtmp;

              // Create copy button
              const copyBtn = document.createElement("button");
              copyBtn.className =
                "copy-rtmp-btn ml-2 text-gray-500 hover:text-purple-600";
              copyBtn.title = "RTMP URL'yi Kopyala";
              copyBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              `;

              // Create delete/stop button
              const stopBtn = document.createElement("button");
              stopBtn.className =
                "stop-transcode-btn ml-2 text-gray-500 hover:text-red-600";
              stopBtn.title = "Transcoding'i Durdur";
              stopBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              `;

              // Append elements to container
              rtmpUrlContainer.appendChild(rtmpText);
              rtmpUrlContainer.appendChild(copyBtn);
              rtmpUrlContainer.appendChild(stopBtn);

              // Add click event to the copy button
              copyBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                // Doğrudan data.rtmp değerini kullanıyoruz
                const rtmpUrlToUse = data.rtmp;
                navigator.clipboard.writeText(rtmpUrlToUse).then(() => {
                  // Show a mini tooltip
                  const miniTip = document.createElement("div");
                  miniTip.className =
                    "fixed z-50 p-1 bg-black text-white text-xs rounded shadow-lg";
                  miniTip.textContent = "Kopyalandı!";
                  miniTip.style.top =
                    window.scrollY +
                    event.target.getBoundingClientRect().top -
                    20 +
                    "px";
                  miniTip.style.left =
                    event.target.getBoundingClientRect().left - 20 + "px";
                  document.body.appendChild(miniTip);

                  setTimeout(() => {
                    document.body.removeChild(miniTip);
                  }, 1500);
                });
              });

              // Add click event to the stop button
              stopBtn.addEventListener("click", async (event) => {
                event.stopPropagation();

                if (
                  confirm(
                    `"${channelName}" kanalının transcodingini durdurmak istediğinizden emin misiniz?`
                  )
                ) {
                  try {
                    // Show stopping indicator
                    const originalContent = stopBtn.innerHTML;
                    stopBtn.innerHTML = `<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>`;

                    const resp = await fetch(
                      `/api/transcode/${encodeURIComponent(channelName)}`,
                      {
                        method: "DELETE",
                      }
                    );
                    const responseData = await resp.json();

                    if (responseData.ok) {
                      // Remove the RTMP URL container
                      if (rtmpUrlContainer.parentNode) {
                        rtmpUrlContainer.parentNode.removeChild(
                          rtmpUrlContainer
                        );
                      }

                      // Remove active state from all buttons
                      buttons.forEach((b) => b.classList.remove("active"));

                      // Show a mini tooltip
                      const miniTip = document.createElement("div");
                      miniTip.className =
                        "fixed z-50 p-1 bg-black text-white text-xs rounded shadow-lg";
                      miniTip.textContent = "Transcoding durduruldu";
                      miniTip.style.top =
                        window.scrollY +
                        event.target.getBoundingClientRect().top -
                        20 +
                        "px";
                      miniTip.style.left =
                        event.target.getBoundingClientRect().left - 20 + "px";
                      document.body.appendChild(miniTip);

                      // Remove the dataset attributes
                      delete channelItem.dataset.activeTranscode;
                      delete channelItem.dataset.rtmpUrl;

                      setTimeout(() => {
                        document.body.removeChild(miniTip);
                      }, 1500);
                    } else {
                      stopBtn.innerHTML = originalContent;
                      alert(
                        "Transcoding durdurulamadı: " +
                          (responseData.error || "bilinmeyen")
                      );
                    }
                  } catch (e) {
                    alert(
                      "Transcoding durdurma isteği başarısız: " + e.message
                    );
                  }
                }
              });
            } else {
              // Eğer container zaten varsa, sadece içeriği güncelleyelim
              const rtmpText = rtmpUrlContainer.querySelector(".rtmp-url");
              if (rtmpText) {
                rtmpText.textContent = data.rtmp;
              }
            }

            // We don't need to store these in dataset anymore as we're using direct variables
            // Keep them for backwards compatibility but they're not used for copying
            channelItem.dataset.activeTranscode = quality;
            channelItem.dataset.rtmpUrl = data.rtmp;

            setTimeout(() => {
              document.body.removeChild(tooltip);
            }, 3000);

            console.log(`Transcoding ${quality} başlatıldı: ${data.rtmp}`);
          } else {
            btn.innerHTML = originalContent;
            btn.disabled = false;
            alert("Transcoding hata: " + (data.error || "bilinmeyen"));
          }
        } catch (e) {
          btn.innerHTML = originalContent;
          btn.disabled = false;
          alert("Transcoding isteği başarısız: " + e.message);
        }
      });
    });
  }

  // Show add channel modal
  function showAddChannelModal(adapterName, adapterNum) {
    // Set adapter info
    document.getElementById("channelAdapterName").value = adapterName;
    document.getElementById("channelAdapterNum").value = adapterNum;
    document.getElementById("editChannelName").value = ""; // No edit mode

    // Clear form
    document.getElementById("channelName").value = "";
    document.getElementById("channelPnr").value = "";
    document.getElementById("channelPort").value = "";
    document.getElementById("channelPath").value = "";

    // Update title and button
    document.getElementById("channelModalTitle").textContent = "Kanal Ekle";
    document.getElementById("channelSubmitText").textContent = "Ekle";

    // Show modal
    channelModal.classList.remove("hidden");
  }

  // Show edit channel modal
  function showEditChannelModal(
    adapterName,
    adapterNum,
    channelName,
    pnr,
    port,
    path
  ) {
    // Set adapter and channel info
    document.getElementById("channelAdapterName").value = adapterName;
    document.getElementById("channelAdapterNum").value = adapterNum;
    document.getElementById("editChannelName").value = channelName;

    // Set form values
    document.getElementById("channelName").value = channelName;
    document.getElementById("channelPnr").value = pnr;
    document.getElementById("channelPort").value = port;
    document.getElementById("channelPath").value = path;

    // Update title and button
    document.getElementById("channelModalTitle").textContent = "Kanalı Düzenle";
    document.getElementById("channelSubmitText").textContent = "Güncelle";

    // Show modal
    channelModal.classList.remove("hidden");
  }

  // Load available adapters for adapter edit form
  function loadAvailableAdaptersForEdit(modal, adapterName, currentAdapter) {
    // Get all adapters from state
    fetch("/api/state")
      .then((response) => response.json())
      .then((data) => {
        const selectElement = modal.querySelector("#edit-adapter-num");
        selectElement.innerHTML = ""; // Clear loading message

        // Filter available adapters - those not used or the one we're currently editing
        const adapters = data.adapters;
        const available = adapters
          .filter((a) => !a.used || a.number === parseInt(currentAdapter))
          .map((a) => a.number);

        if (available.length === 0) {
          const option = document.createElement("option");
          option.value = "";
          option.textContent = "Kullanılabilir adapter yok";
          selectElement.appendChild(option);
        } else {
          // Add all available adapters
          for (const num of available) {
            const option = document.createElement("option");
            option.value = num;
            option.textContent = `adapter${num}${
              num == currentAdapter ? " (Mevcut)" : ""
            }`;
            option.selected = num == currentAdapter;
            selectElement.appendChild(option);
          }
        }
      })
      .catch((error) => {
        console.error("Adapterler yüklenemedi:", error);
        const selectElement = modal.querySelector("#edit-adapter-num");
        selectElement.innerHTML = `<option value="${currentAdapter}">${currentAdapter}</option>`;
      });
  }

  // Show edit adapter modal
  function showEditAdapterModal(name, adapterNum, freq, symbol, pol) {
    // Create modal on the fly
    const modal = document.createElement("div");
    modal.className =
      "fixed inset-0 modal-backdrop flex items-center justify-center z-50";

    modal.innerHTML = `
      <div class="modal-content p-6 w-[500px] max-w-full">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">Adapter Düzenle: ${name}</h2>
          <button class="close-edit-adapter text-gray-500 hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form id="edit-adapter-form" class="space-y-4">
          <div>
            <label class="text-sm font-medium">Adapter Numarası</label>
            <select
              id="edit-adapter-num"
              required
              class="mt-1 w-full"
            >
              <option value="">Adapterleri yükleniyor...</option>
            </select>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="text-sm font-medium">Frekans (MHz)</label>
              <input
                id="edit-adapter-freq"
                required
                class="mt-1 w-full"
                value="${freq}"
              />
            </div>
            <div>
              <label class="text-sm font-medium">Symbol Rate</label>
              <input
                id="edit-adapter-symbol"
                required
                class="mt-1 w-full"
                value="${symbol}"
              />
            </div>
            <div>
              <label class="text-sm font-medium">Polarizasyon</label>
              <select
                id="edit-adapter-pol"
                class="mt-1 w-full"
              >
                <option value="H" ${pol === "H" ? "selected" : ""}>H</option>
                <option value="V" ${pol === "V" ? "selected" : ""}>V</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <button type="button" class="cancel-edit-btn mr-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white">
              İptal
            </button>
            <button type="submit" class="primary">
              Güncelle
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Load available adapters for edit
    loadAvailableAdaptersForEdit(modal, name, adapterNum);

    // Close button
    modal.querySelector(".close-edit-adapter").addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    // Cancel button
    modal.querySelector(".cancel-edit-btn").addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    // Form submission
    modal
      .querySelector("#edit-adapter-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();

        const newAdapter = modal
          .querySelector("#edit-adapter-num")
          .value.trim();
        const newFreq = modal.querySelector("#edit-adapter-freq").value.trim();
        const newSymbol = modal
          .querySelector("#edit-adapter-symbol")
          .value.trim();
        const newPol = modal.querySelector("#edit-adapter-pol").value;

        if (!newAdapter || !newFreq || !newSymbol) {
          alert("Tüm alanları doldurun");
          return;
        }

        try {
          const response = await fetch(
            `/api/adapters/${encodeURIComponent(name)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                adapter: parseInt(newAdapter, 10),
                frequency: newFreq,
                symbol: newSymbol,
                pol: newPol,
              }),
            }
          );

          const data = await response.json();
          if (data.ok) {
            document.body.removeChild(modal);
            loadState(); // Reload to reflect changes
          } else {
            showErrorMessage(
              `Adapter güncellenirken hata: ${data.error || "Bilinmeyen hata"}`
            );
          }
        } catch (error) {
          showErrorMessage("İşlem sırasında bir hata oluştu");
        }
      });
  }

  // Setup real-time updates
  function setupRealTimeUpdates() {
    // Update signal strengths every 2 seconds
    setInterval(updateSignalStrengths, 2000);

    // Update channel statistics every 3 seconds
    setInterval(updateChannelStatistics, 3000);
  }

  // Update signal strengths
  async function updateSignalStrengths() {
    const adapterCards = adaptersContainer.querySelectorAll(".adapter-card");

    for (const card of adapterCards) {
      const adapterName = card.dataset.adapterName;
      if (!adapterName) continue;

      try {
        const response = await fetch(
          `/api/adapters/${encodeURIComponent(adapterName)}/signal`
        );
        const data = await response.json();

        if (!data) continue;

        // Signal bar
        const sBar = card.querySelector(".s-bar-fill");
        const qBar = card.querySelector(".q-bar-fill");

        // Signal text
        const sValue = card.querySelector(".signal-strength-value");
        const qValue = card.querySelector(".quality-value");
        const berValue = card.querySelector(".ber-value");
        const uncValue = card.querySelector(".unc-value");

        if (data.status === "no-lua") {
          // No lua file for this adapter
          if (sBar) sBar.style.width = "0%";
          if (qBar) qBar.style.width = "0%";
          if (sValue) sValue.textContent = "-";
          if (qValue) qValue.textContent = "-";
          if (berValue) berValue.textContent = "ber:0";
          if (uncValue) uncValue.textContent = "unc:0";
        } else {
          // Update with signal data
          if (sBar) {
            sBar.style.width = `${data.signalStrength}%`;
          }

          if (qBar) {
            qBar.style.width = `${data.qualityLevel}%`;
          }

          if (sValue) sValue.textContent = `${data.signalStrength}%`;
          if (qValue) qValue.textContent = `${data.qualityLevel}%`;
          if (berValue) berValue.textContent = `ber:${data.ber}`;
          if (uncValue) uncValue.textContent = `unc:${data.unc}`;
        }
      } catch (error) {
        console.error(`Error updating signal for ${adapterName}:`, error);
      }
    }
  }

  // Update channel statistics
  async function updateChannelStatistics() {
    const adapterCards = adaptersContainer.querySelectorAll(".adapter-card");

    for (const card of adapterCards) {
      const adapterName = card.dataset.adapterName;
      if (!adapterName) continue;

      try {
        const response = await fetch(
          `/api/adapters/${encodeURIComponent(adapterName)}/channels/stats`
        );
        const channelsData = await response.json();

        if (!channelsData || !channelsData.length) continue;

        const channelItems = card.querySelectorAll(".channel-item");

        channelItems.forEach((channelItem) => {
          const channelNameEl = channelItem.querySelector(".channel-name");
          if (!channelNameEl) return;

          const channelName = channelNameEl.textContent;
          const channelData = channelsData.find(
            (c) => c.channelName === channelName
          );

          if (!channelData) return;

          // Update status indicator
          const statusEl = channelItem.querySelector(".channel-status");
          if (statusEl) {
            statusEl.className = `channel-status w-2 h-2 rounded-full ${
              channelData.isActive ? "bg-green-500" : "bg-gray-400"
            }`;
          }

          // Update bitrate
          const bitrateEl = channelItem.querySelector(".channel-bitrate");
          if (bitrateEl) {
            if (channelData.isActive) {
              const kb = Math.max(0, Math.round(channelData.bitrate));
              bitrateEl.textContent = `${kb} Kbit/s`;
              bitrateEl.className = "channel-bitrate bitrate-update";

              // Remove animation class after animation completes
              setTimeout(() => {
                bitrateEl.className = "channel-bitrate";
              }, 500);
            } else {
              bitrateEl.textContent = "Inactive";
              bitrateEl.className = "channel-bitrate inactive";
            }
          }
        });
      } catch (error) {
        console.error(
          `Error updating channel stats for ${adapterName}:`,
          error
        );
      }
    }
  }

  // Handle adapter form submission
  createAdapterForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("adapterName").value.trim();
    const adapter = parseInt(
      document.getElementById("adapterNumber").value,
      10
    );
    const frequency = document.getElementById("frequency").value.trim();
    const symbol = document.getElementById("symbol").value.trim();
    const pol = document.getElementById("pol").value;

    if (!name || isNaN(adapter) || !frequency || !symbol) {
      alert("Tüm alanları doldurun");
      return;
    }

    try {
      const response = await fetch("/api/adapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, adapter, frequency, symbol, pol }),
      });

      const data = await response.json();
      if (data.ok) {
        createAdapterForm.reset();
        adapterFormModal.classList.add("hidden");
        loadState(); // Reload to show new adapter
      } else {
        showErrorMessage(
          `Adapter oluşturulurken hata: ${data.error || "Bilinmeyen hata"}`
        );
      }
    } catch (error) {
      showErrorMessage("İşlem sırasında bir hata oluştu");
    }
  });

  // Handle channel form submission
  channelForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const adapterName = document.getElementById("channelAdapterName").value;
    const adapterNum = document.getElementById("channelAdapterNum").value;
    const editChannelName = document.getElementById("editChannelName").value;

    const channelName = document.getElementById("channelName").value.trim();
    const pnr = document.getElementById("channelPnr").value.trim();
    const port = document.getElementById("channelPort").value.trim();
    const path = document.getElementById("channelPath").value.trim();

    if (!channelName || !pnr || !port || !path) {
      alert("Tüm alanları doldurun");
      return;
    }

    try {
      let url, method, body;

      if (editChannelName) {
        // Edit existing channel
        url = `/api/adapters/${encodeURIComponent(
          adapterName
        )}/channels/${encodeURIComponent(editChannelName)}`;
        method = "PUT";
        body = {
          newName: channelName,
          pnr,
          port,
          path: path.startsWith("/") ? path : `/${path}`,
          adapterNum,
        };
      } else {
        // Add new channel
        url = `/api/adapters/${encodeURIComponent(adapterName)}/channels`;
        method = "POST";
        body = {
          channelName,
          pnr,
          port,
          path: path.startsWith("/") ? path : `/${path}`,
          adapterNum,
        };
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.ok) {
        channelForm.reset();
        channelModal.classList.add("hidden");
        loadState(); // Reload to show changes
      } else {
        showErrorMessage(
          `Kanal ${editChannelName ? "güncellenirken" : "eklenirken"} hata: ${
            data.error || "Bilinmeyen hata"
          }`
        );
      }
    } catch (error) {
      showErrorMessage("İşlem sırasında bir hata oluştu");
    }
  });

  // Show error message
  function showErrorMessage(message) {
    alert(message); // Simple alert for now
  }

  // Refresh button
  refreshBtn.addEventListener("click", loadState);

  // Initial load
  loadState();
})();
