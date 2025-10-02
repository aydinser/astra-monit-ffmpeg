// modal-functions.js

// Modal utility functions
function openModal(modal) {
  if (modal) modal.classList.remove("hidden");
}

function closeModal(modal) {
  if (modal) modal.classList.add("hidden");
}

// Make these functions globally available
window.openModal = openModal;
window.closeModal = closeModal;

// Function to delete a channel
function deleteChannel(adapterName, channelName) {
  return fetch(
    `/api/adapters/${encodeURIComponent(
      adapterName
    )}/channels/${encodeURIComponent(channelName)}`,
    { method: "DELETE" }
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (j) {
      if (j.ok) {
        alert("Kanal silindi");
        if (typeof window.loadState === "function") {
          window.loadState();
        }
        return true;
      } else {
        alert("Hata: " + (j.error || "Kanal silme işlemi başarısız"));
        return false;
      }
    })
    .catch(function (error) {
      alert("İşlem sırasında bir hata oluştu: " + error.message);
      return false;
    });
}

// Make delete function globally available
window.deleteChannel = deleteChannel;

// Document ready function for modal setup
document.addEventListener("DOMContentLoaded", function () {
  // Handle channel form modal
  const channelFormModal = document.getElementById("channelFormModal");
  const channelForm = document.getElementById("channelForm");
  const channelModalTitle = document.getElementById("channelModalTitle");
  const channelSubmitText = document.getElementById("channelSubmitText");

  if (channelForm) {
    channelForm.addEventListener("submit", function (e) {
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

      fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (j) {
          if (j.ok) {
            alert(mode === "edit" ? "Kanal güncellendi" : "Kanal eklendi");
            closeModal(channelFormModal);
            if (typeof window.loadState === "function") {
              window.loadState();
            }
          } else {
            alert("Hata: " + (j.error || "unknown"));
          }
        })
        .catch(function (error) {
          alert("İşlem sırasında bir hata oluştu: " + error.message);
        });
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

      openModal(channelFormModal);
    });
  }

  // Close modals when clicking outside
  document.addEventListener("click", function (e) {
    const modals = document.querySelectorAll(".modal");
    modals.forEach(function (modal) {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  // Close button functionality for all modals
  const closeModalBtns = document.querySelectorAll(".close-modal");
  closeModalBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const modal = btn.closest(".modal");
      closeModal(modal);
    });
  });

  // Helper to populate adapter select
  function populateAdapterSelect() {
    const adapterSelect = document.getElementById("adapterSelect");
    if (!adapterSelect) return;

    fetch("/api/state")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
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
      })
      .catch(function (error) {
        console.error("Error loading adapters:", error);
      });
  }
});
