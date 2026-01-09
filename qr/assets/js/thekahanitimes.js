// Minimal JS for page tabs + audio player

document.addEventListener("DOMContentLoaded", () => {
  const pageTabs = document.querySelectorAll(".page-tab");
  const pages = document.querySelectorAll(".newsletter-page");

  const audioPlayer = document.getElementById("audioPlayer");
  const nowPlaying = document.getElementById("nowPlaying");
  const sectionButtons = document.querySelectorAll(".section-button");

  // Page tab logic
  pageTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetPage = tab.dataset.page;

      pageTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      pages.forEach((page) => {
        page.classList.toggle("active", page.dataset.page === targetPage);
      });
    });
  });

  // Audio logic
  sectionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.dataset.audio;
      const title = btn.dataset.title || btn.innerText.trim();
      if (!src) return;

      // Ensure absolute URL for comparison (audioPlayer.src is absolute once set)
      const nextUrl = new URL(src, window.location.href).href;

      if (audioPlayer.src !== nextUrl) {
        audioPlayer.src = nextUrl;
      }

      audioPlayer.play().catch(() => {
        // autoplay might be blocked; user can press play
      });

      nowPlaying.innerHTML = `Now playing: <strong>${title}</strong>`;
    });
  });
});
