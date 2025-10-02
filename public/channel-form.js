// Channel Form Handler
document.addEventListener("DOMContentLoaded", function () {
  const channelFormModal = document.getElementById("channelFormModal");
  const channelForm = document.getElementById("channelForm");
  const channelModalTitle = document.getElementById("channelModalTitle");
  const channelSubmitText = document.getElementById("channelSubmitText");

  if (channelForm) {
    channelForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const mode = channelFormModal.dataset.mode || "add";
      const adapterName =
        mode === "edit"
          ? channelFormModal.dataset.adapterName
          : document.getElementById("adapterSelect").value;

      const channelName = document.getElementById("channelName").value.trim();
      const pnr = document.getElementById("channelPnr").value.trim();
      const port = document.getElementById("channelPort").value.trim();
      const outputPath = document.getElementById("channelOutput").value.trim();

      if (!channelName || !pnr || !port || !outputPath || !adapterName) {
        alert("Tüm alanları doldurun");
        return;
      }

      try {
        let url = `/api/adapters/${encodeURIComponent(adapterName)}/channels`;
        let method = "POST";
        let body = {
          channelName,
          pnr,
          port,
          path: outputPath,
        };

        // If we're editing, adjust the request
        if (mode === "edit") {
          const originalName = channelFormModal.dataset.originalName;
          url = `/api/adapters/${encodeURIComponent(
            adapterName
          )}/channels/${encodeURIComponent(originalName)}`;
          method = "PUT";
          body.newName = channelName;
        }

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const j = await res.json();
        if (j.ok) {
          alert(mode === "edit" ? "Kanal güncellendi" : "Kanal eklendi");
          window.closeModal(channelFormModal);
          window.loadState();
        } else {
          alert("Hata: " + (j.error || "unknown"));
        }
      } catch (error) {
        alert("İşlem sırasında bir hata oluştu: " + error.message);
      }
    });
  }

  // Setup for new channel button
  const newChannelBtn = document.getElementById("newChannelBtn");
  if (newChannelBtn) {
    newChannelBtn.addEventListener("click", function () {
      populateAdapterSelect();
      channelModalTitle.textContent = "Yeni Kanal Ekle";
      channelSubmitText.textContent = "Ekle";
      channelForm.reset();

      // Set to add mode
      channelFormModal.dataset.mode = "add";
      delete channelFormModal.dataset.originalName;
      delete channelFormModal.dataset.adapterName;

      window.openModal(channelFormModal);
    });
  }

  // Helper to populate adapter select
  async function populateAdapterSelect() {
    const adapterSelect = document.getElementById("adapterSelect");
    if (!adapterSelect) return;

    try {
      const res = await fetch("/api/state");
      const data = await res.json();

      adapterSelect.innerHTML = "";

      // Add option for each adapter
      if (data.luaFiles && data.luaFiles.length > 0) {
        for (const lua of data.luaFiles) {
          const name = lua.file.replace(".lua", "");
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          adapterSelect.appendChild(option);
        }
      } else {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Önce adapter ekleyin";
        option.disabled = true;
        option.selected = true;
        adapterSelect.appendChild(option);
      }
    } catch (error) {
      console.error("Error loading adapters:", error);
    }
  }
});
