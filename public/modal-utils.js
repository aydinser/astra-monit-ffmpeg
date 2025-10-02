// modal-utils.js
window.openModal = function (modal) {
  if (modal) modal.classList.remove("hidden");
};

window.closeModal = function (modal) {
  if (modal) modal.classList.add("hidden");
};

window.deleteChannel = function (adapterName, channelName) {
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
root@aydin:/usr/local/bin/astra-panel/public# cat modal-utils.js 
// modal-utils.js
window.openModal = function (modal) {
  if (modal) modal.classList.remove("hidden");
};

window.closeModal = function (modal) {
  if (modal) modal.classList.add("hidden");
};

window.deleteChannel = function (adapterName, channelName) {
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
};

// Initialize modal functionality when document is ready
document.addEventListener("DOMContentLoaded", function () {
  // Close modals when clicking outside
  document.addEventListener("click", function (e) {
    const modals = document.querySelectorAll(".modal");
    modals.forEach(function (modal) {
      if (e.target === modal) {
        window.closeModal(modal);
      }
    });
  });

  // Close button functionality for all modals
  const closeModalBtns = document.querySelectorAll(".close-modal");
  closeModalBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const modal = btn.closest(".modal");
      window.closeModal(modal);
    });
  });
});
