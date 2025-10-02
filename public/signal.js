// signal.js
// Bu dosya gerçek zamanlı sinyal ve kanal istatistik verilerini simüle etmek için kullanılır

document.addEventListener("DOMContentLoaded", function () {
  // Sinyal değerlerini simüle etmek için
  function simulateSignalValues(adapterName) {
    // Adaptör ismini kullanarak tutarlı ama biraz değişken değerler üretebiliriz
    const adapterHash = hashCode(adapterName);
    const now = Date.now();

    // Adaptörün belirli bir "kalite" değeri olsun (0-1 arasında)
    const baseQuality = ((adapterHash % 100) / 100) * 0.4 + 0.6; // 0.6 ile 1.0 arasında

    // Zaman bazlı dalgalanmalar
    const timeVariation = Math.sin(now / 10000) * 0.1;

    // Sinyal gücü: 60% - 100% arasında değişsin
    const signalStrength = Math.floor((baseQuality + timeVariation) * 40 + 60);

    // Sinyal kalitesi: 75% - 100% arasında değişsin
    const qualityLevel = Math.floor(
      (baseQuality + timeVariation * 0.5) * 25 + 75
    );

    // BER ve UNC değerleri - düşük olması daha iyi
    const ber = Math.floor((1 - baseQuality) * 15);
    const unc = Math.floor((1 - baseQuality) * 8);

    // Nadiren sinyal kaybı yaşasın (düşük ihtimalle)
    const isLocked = Math.random() > 0.05 * (1 - baseQuality);

    return {
      name: adapterName,
      signalStrength,
      qualityLevel,
      ber,
      unc,
      status: isLocked ? "locked" : "unlocked",
    };
  }

  // Kanal istatistiklerini simüle etmek için
  function simulateChannelStats(channelName, adapterName) {
    // Kanal ismini kullanarak tutarlı ama biraz değişken değerler üretebiliriz
    const channelHash = hashCode(channelName + adapterName);
    const now = Date.now();

    // Kanal "sağlığı" (0-1 arasında)
    const baseHealth = ((channelHash % 100) / 100) * 0.3 + 0.7; // 0.7 ile 1.0 arasında

    // Zaman bazlı dalgalanmalar
    const timeVariation = Math.sin(now / 15000 + channelHash) * 0.1;

    // İsim içinde "inactive" veya "test" geçiyorsa daha düşük aktif olma ihtimali
    const nameEffect = channelName.toLowerCase().includes("inactive")
      ? 0.7
      : channelName.toLowerCase().includes("test")
      ? 0.4
      : 0;

    // Kanalın aktif olma durumu
    const isActive = Math.random() > 0.1 * (1 - baseHealth) + nameEffect;

    // Bitrate: 1.5 - 8.0 Mbps arasında değişsin
    const baseBitrate = ((channelHash % 100) / 100) * 5000 + 1500; // 1500-6500 baz değeri
    const bitrate = isActive
      ? Math.floor(baseBitrate + timeVariation * 1000)
      : 0;

    // İzleyici sayısı: 0-100 arasında
    const viewers = isActive
      ? Math.floor(baseHealth * 80 + Math.random() * 20)
      : 0;

    // Uptime: 1-24 saat arasında
    const uptime = isActive
      ? Math.floor(baseHealth * 20 + Math.random() * 4 + 1)
      : 0;

    return {
      channelName,
      isActive,
      bitrate,
      viewers,
      uptime,
      status: isActive ? "streaming" : "offline",
    };
  }

  // Basit string hash fonksiyonu - sabit değerler üretmek için
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Gerçek API'leri taklit eden mock API'ler
  const originalFetch = window.fetch;
  window.fetch = function (url, options) {
    // Sinyal API'si
    if (url.includes("/api/adapters/") && url.includes("/signal")) {
      const adapterName = url.split("/adapters/")[1].split("/signal")[0];
      const decodedName = decodeURIComponent(adapterName);

      // First call the original fetch to let server check if this adapter has a lua file
      return originalFetch(url, options).then((response) => {
        return response.json().then((data) => {
          // If the adapter has no lua file, preserve the server response
          if (data.status === "no-lua") {
            return {
              json: () => Promise.resolve(data),
            };
          } else {
            // For real adapters, enhance with our dynamic simulation
            const simulatedData = simulateSignalValues(decodedName);
            return {
              json: () => Promise.resolve(simulatedData),
            };
          }
        });
      });
    }
    // Kanal istatistikleri API'si
    else if (
      url.includes("/api/adapters/") &&
      url.includes("/channels/stats")
    ) {
      const adapterName = url
        .split("/adapters/")[1]
        .split("/channels/stats")[0];
      const decodedName = decodeURIComponent(adapterName);

      // Geçerli DOM'da bu adaptöre ait kanal isimlerini bul
      const adapterCards = document.querySelectorAll(
        "#adaptersContainer .adapter-card"
      );
      let channelNames = [];

      for (const card of adapterCards) {
        if (card.dataset.adapterName === decodedName) {
          const channelElements = card.querySelectorAll(".channel-name");
          channelNames = Array.from(channelElements).map(
            (el) => el.textContent
          );
          break;
        }
      }

      return new Promise((resolve) => {
        setTimeout(() => {
          const stats = channelNames.map((name) =>
            simulateChannelStats(name, decodedName)
          );

          resolve({
            json: () => Promise.resolve(stats),
          });
        }, 200);
      });
    }
    // All other requests pass through to the original fetch
    return originalFetch(url, options);
  };

  console.log("✅ Signal simulation initialized");
});
