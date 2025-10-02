// video-player.js
// This script handles the functionality for the video player modal

document.addEventListener("DOMContentLoaded", function () {
  // Get DOM elements
  const videoPlayerModal = document.getElementById("videoPlayerModal");
  const videoPlayerTitle = document.getElementById("videoPlayerTitle");
  const streamPlayer = document.getElementById("streamPlayer");
  const streamIframe = document.getElementById("streamIframe");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const streamDetails = document.getElementById("streamDetails");
  const streamResolution = document.getElementById("streamResolution");
  const streamBitrate = document.getElementById("streamBitrate");
  const playerModeVideo = document.getElementById("playerModeVideo");
  const playerModeIframe = document.getElementById("playerModeIframe");
  const openInBrowserBtn = document.getElementById("openInBrowserBtn");

  // Track current stream URL
  let currentStreamUrl = "";

  // Current playback mode
  let currentMode = "video"; // 'video' or 'iframe'

  // Function to test if URL is reachable
  async function isUrlReachable(url) {
    try {
      // Add a random query parameter to avoid caching
      const testUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
      const response = await fetch(testUrl, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-cache",
        timeout: 3000,
      });
      return true;
    } catch (error) {
      console.error("URL check error:", error);
      return false;
    }
  }

  // Setup playback mode buttons
  playerModeVideo.addEventListener("click", () => {
    setPlaybackMode("video");
    if (currentStreamUrl) {
      playStreamInVideoMode(currentStreamUrl);
    }
  });

  playerModeIframe.addEventListener("click", () => {
    setPlaybackMode("iframe");
    if (currentStreamUrl) {
      playStreamInIframeMode(currentStreamUrl);
    }
  });

  // Open in browser button
  openInBrowserBtn.addEventListener("click", () => {
    if (currentStreamUrl) {
      window.open(currentStreamUrl, "_blank");
    }
  });

  // Function to set the playback mode
  function setPlaybackMode(mode) {
    currentMode = mode;

    // Update UI
    if (mode === "video") {
      playerModeVideo.classList.remove("text-gray-300");
      playerModeVideo.classList.add("bg-blue-600", "text-white");
      playerModeIframe.classList.remove("bg-blue-600", "text-white");
      playerModeIframe.classList.add("text-gray-300");

      // Show video player, hide iframe
      streamPlayer.classList.remove("hidden");
      streamIframe.classList.add("hidden");
    } else {
      playerModeIframe.classList.remove("text-gray-300");
      playerModeIframe.classList.add("bg-blue-600", "text-white");
      playerModeVideo.classList.remove("bg-blue-600", "text-white");
      playerModeVideo.classList.add("text-gray-300");

      // Show iframe, hide video player
      streamIframe.classList.remove("hidden");
      streamPlayer.classList.add("hidden");
    }
  }

  // Play stream in video mode (using HTML5 video or HLS.js)
  function playStreamInVideoMode(streamUrl) {
    try {
      // First clean up any existing player
      cleanupVideoPlayer();

      // Show the video element, hide iframe
      streamPlayer.classList.remove("hidden");
      streamIframe.classList.add("hidden");

      // Check if Hls.js is supported
      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({
          debug: false,
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 20000,
          levelLoadingTimeOut: 20000,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
        });

        hls.attachMedia(streamPlayer);
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
          console.log("HLS.js: Media attached");
          hls.loadSource(streamUrl);

          hls.on(Hls.Events.MANIFEST_PARSED, function () {
            console.log("HLS.js: Manifest parsed");
            streamPlayer.play().catch((err) => {
              console.error("HLS play error:", err);
              showStreamError();
            });
          });
        });

        // Error handling
        hls.on(Hls.Events.ERROR, function (event, data) {
          console.error("HLS error:", data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("HLS network error - trying to recover");
                hls.startLoad(); // Try to recover network error
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("HLS media error - trying to recover");
                hls.recoverMediaError(); // Try to recover media error
                break;
              default:
                // Cannot recover
                hls.destroy();
                showStreamError();
                break;
            }
          }
        });

        // Store HLS instance for cleanup
        streamPlayer._hlsInstance = hls;
      }
      // For browsers that natively support HLS (Safari)
      else if (streamPlayer.canPlayType("application/vnd.apple.mpegurl")) {
        streamPlayer.src = streamUrl;
        streamPlayer.addEventListener("loadedmetadata", function () {
          streamPlayer.play().catch((err) => {
            console.error("Native HLS play error:", err);
            showStreamError();
          });
        });
      }
      // Fallback to direct streaming (may not work for HLS)
      else {
        streamPlayer.src = streamUrl;

        // Play video with a timeout to handle cases where the stream doesn't respond
        const playPromise = streamPlayer.play();

        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.error("Video playback error:", err);
            showStreamError();
          });
        }
      }

      // Set a timeout to check if the video started playing
      setTimeout(() => {
        if (
          streamPlayer.readyState === 0 &&
          !loadingIndicator.classList.contains("hidden")
        ) {
          showStreamError();

          // If video mode fails, automatically try iframe mode
          setPlaybackMode("iframe");
          playStreamInIframeMode(streamUrl);
        }
      }, 5000);
    } catch (err) {
      console.error("Video setup error:", err);
      showStreamError();
    }
  }

  // Play stream in iframe mode
  function playStreamInIframeMode(streamUrl) {
    // Clean up any existing player
    cleanupVideoPlayer();

    // Show iframe, hide video player
    streamIframe.classList.remove("hidden");
    streamPlayer.classList.add("hidden");

    // Create an HTML player page to display in the iframe
    // This creates a custom HTML page with a video element that will play the stream
    const playerHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Stream Player</title>
          <style>
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #000; }
            .player-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
            video { width: 100%; height: 100%; max-height: 100%; object-fit: contain; }
            .error-message { color: #ff4d4f; text-align: center; font-family: Arial, sans-serif; padding: 20px; }
            .loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; }
          </style>
          <!-- Include HLS.js for better stream support -->
          <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        </head>
        <body>
          <div class="player-container">
            <video id="player" controls autoplay playsinline></video>
            <div id="loading" class="loading">Loading...</div>
          </div>
          <script>
            // Get the video element
            const video = document.getElementById('player');
            const loading = document.getElementById('loading');
            const streamUrl = "${streamUrl}";
            
            // Function to handle errors
            function handleError(error) {
              console.error('Player error:', error);
              document.body.innerHTML = \`
                <div class="error-message">
                  <h3>Yayın başlatılamadı</h3>
                  <p>Kanal yayını aktif değil veya erişilemedi</p>
                  <p>URL: ${streamUrl}</p>
                </div>
              \`;
            }
            
            // Play the stream
            function playStream() {
              try {
                // Check if HLS.js is supported and the URL seems like an HLS stream
                if (Hls.isSupported()) {
                  const hls = new Hls({
                    debug: false,
                    fragLoadingTimeOut: 20000,
                    manifestLoadingTimeOut: 20000,
                    levelLoadingTimeOut: 20000,
                  });
                  
                  hls.attachMedia(video);
                  hls.on(Hls.Events.MEDIA_ATTACHED, function() {
                    hls.loadSource(streamUrl);
                    
                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                      video.play().catch(handleError);
                      if (loading) loading.style.display = 'none';
                    });
                  });
                  
                  hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                      if (loading) loading.style.display = 'none';
                      switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                          hls.startLoad(); // Try to recover
                          break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                          hls.recoverMediaError(); // Try to recover
                          break;
                        default:
                          handleError(data);
                          break;
                      }
                    }
                  });
                } 
                // For Safari which has native HLS support
                else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                  video.src = streamUrl;
                  video.addEventListener('loadedmetadata', function() {
                    video.play().catch(handleError);
                    if (loading) loading.style.display = 'none';
                  });
                } 
                // Direct playback as fallback
                else {
                  video.src = streamUrl;
                  video.play().catch(handleError);
                  if (loading) loading.style.display = 'none';
                }
                
                video.addEventListener('playing', function() {
                  if (loading) loading.style.display = 'none';
                });
                
                video.addEventListener('error', function() {
                  handleError('Video playback error');
                });
                
                // Hide loading after timeout even if we don't get events
                setTimeout(() => {
                  if (loading) loading.style.display = 'none';
                }, 5000);
              } catch (error) {
                handleError(error);
              }
            }
            
            // Start playback once page is loaded
            document.addEventListener('DOMContentLoaded', playStream);
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
              playStream();
            }
          </script>
        </body>
      </html>
    `;

    // Create a blob URL from the HTML content
    const blob = new Blob([playerHtml], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);

    // Set the iframe source to the blob URL
    streamIframe.src = blobUrl;

    // Hide loading indicator after a moment
    setTimeout(() => {
      loadingIndicator.classList.add("hidden");
    }, 2000);
  }

  // Function to open the video player
  async function openVideoPlayer(channelName, streamUrl) {
    // Store the current stream URL
    currentStreamUrl = streamUrl;

    // Ensure the URL has http:// prefix if needed
    if (!streamUrl.startsWith("http://") && !streamUrl.startsWith("https://")) {
      streamUrl = "http://" + streamUrl;
      currentStreamUrl = streamUrl;
    }

    // Set video player title
    videoPlayerTitle.textContent = `Kanal İzleme: ${channelName}`;

    // Show loading indicator
    loadingIndicator.classList.remove("hidden");
    loadingIndicator.innerHTML = `
      <div class="flex flex-col items-center">
        <svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-white mt-2">Yayın başlatılıyor...</span>
      </div>
    `;

    // Set stream details
    streamDetails.textContent = streamUrl;

    // Open modal
    window.openModal(videoPlayerModal);

    try {
      // Try to detect if this is a direct HTTP stream (non-HLS)
      // For direct HTTP streams, iframe mode might work better
      const isLikelyDirectStream =
        streamUrl.includes(".ts") ||
        streamUrl.includes("raw=1") ||
        streamUrl.includes(":8080/") ||
        streamUrl.includes(":6664/") ||
        streamUrl.includes("0.0.0.0");

      // Choose the most appropriate mode based on URL
      if (isLikelyDirectStream && currentMode === "video") {
        console.log(
          "Detected likely direct stream, automatically switching to iframe mode"
        );
        currentMode = "iframe";
      }
    } catch (e) {
      console.error("Error in stream detection:", e);
    }

    // Set the initial playback mode
    setPlaybackMode(currentMode);

    // Play the stream in the current mode
    if (currentMode === "video") {
      playStreamInVideoMode(streamUrl);
    } else {
      playStreamInIframeMode(streamUrl);
    }
  }

  function showStreamError() {
    loadingIndicator.innerHTML = `
      <div class="flex flex-col items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-red-400">Yayın başlatılamadı</span>
        <span class="text-xs text-gray-400 mt-1">Kanal yayını aktif değil veya erişilemedi</span>
        
        <!-- Current URL -->
        <div class="bg-gray-800 text-gray-300 p-2 rounded mt-2 text-xs w-full text-center overflow-x-auto">
          <code>${currentStreamUrl || "No stream URL"}</code>
        </div>
        
        <!-- Action buttons -->
        <div class="flex flex-wrap justify-center gap-2 mt-3">
          <button id="retryStreamBtn" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded">
            Tekrar Dene
          </button>
          <button id="tryIframeBtn" class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded">
            IFrame Modunda Dene
          </button>
          <button id="errorOpenInBrowserBtn" class="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded">
            Tarayıcıda Aç
          </button>
          <button id="tryVlcBtn" class="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded">
            VLC ile Aç
          </button>
        </div>
      </div>
    `;

    // Add retry button functionality
    const retryBtn = document.getElementById("retryStreamBtn");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        // Get the current stream URL from the details text
        const streamUrl = currentStreamUrl;

        // Clean up existing player resources
        cleanupVideoPlayer();

        // Show loading again
        loadingIndicator.innerHTML = `
          <div class="flex flex-col items-center">
            <svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-white mt-2">Yayın başlatılıyor...</span>
          </div>
        `;

        // Add cache busting parameter to URL
        const retryUrl =
          streamUrl + (streamUrl.includes("?") ? "&" : "?") + "_=" + Date.now();

        // Make sure we're in video mode
        setPlaybackMode("video");

        // Try again with a slight delay
        setTimeout(() => {
          playStreamInVideoMode(retryUrl);
        }, 500);
      });
    }

    // Add try iframe button functionality
    const tryIframeBtn = document.getElementById("tryIframeBtn");
    if (tryIframeBtn) {
      tryIframeBtn.addEventListener("click", function () {
        const streamUrl = currentStreamUrl;

        // Switch to iframe mode
        setPlaybackMode("iframe");

        // Play in iframe mode
        playStreamInIframeMode(streamUrl);
      });
    }

    // Add open in browser button functionality
    const errorOpenInBrowserBtn = document.getElementById(
      "errorOpenInBrowserBtn"
    );
    if (errorOpenInBrowserBtn) {
      errorOpenInBrowserBtn.addEventListener("click", function () {
        if (currentStreamUrl) {
          window.open(currentStreamUrl, "_blank");
        }
      });
    }

    // Add VLC button functionality
    const tryVlcBtn = document.getElementById("tryVlcBtn");
    if (tryVlcBtn) {
      tryVlcBtn.addEventListener("click", function () {
        if (currentStreamUrl) {
          // Create a VLC protocol link
          const vlcUrl = `vlc://${currentStreamUrl}`;

          // Try to open VLC
          window.open(vlcUrl, "_blank");

          // Show a message about VLC
          alert(
            "VLC player açılış denemesi yapıldı.\n\nEğer VLC otomatik açılmadıysa, lütfen manuel olarak VLC'yi açıp ağ akışı (network stream) seçeneği ile yayın URL'sini yapıştırın."
          );
        }
      });
    }

    loadingIndicator.classList.remove("hidden");
  }

  // Make function globally available
  window.openVideoPlayer = openVideoPlayer;

  // Event listener for when video starts playing
  streamPlayer.addEventListener("playing", function () {
    // Hide loading indicator
    loadingIndicator.classList.add("hidden");

    // Set simulated video info
    streamResolution.textContent = "720p";
    streamBitrate.textContent = "2.5 Mbps";
  });

  // Event listener for video errors
  streamPlayer.addEventListener("error", function () {
    showStreamError();
  });

  // Function to clean up video player resources
  function cleanupVideoPlayer() {
    // Stop playback
    streamPlayer.pause();

    // Clean up HLS instance if it exists
    if (streamPlayer._hlsInstance) {
      streamPlayer._hlsInstance.destroy();
      streamPlayer._hlsInstance = null;
    }

    // Clear video source
    streamPlayer.src = "";
    streamPlayer.load();

    // Clear iframe source
    streamIframe.src = "";
  }

  // Close modal handler - clean up video when modal is closed
  videoPlayerModal.addEventListener("click", function (e) {
    if (e.target === videoPlayerModal) {
      cleanupVideoPlayer();
      window.closeModal(videoPlayerModal);
    }
  });

  // Close button handler
  videoPlayerModal
    .querySelector(".close-modal")
    .addEventListener("click", function () {
      window.closeModal(videoPlayerModal);
      cleanupVideoPlayer();
    });
});
