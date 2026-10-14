// Story audio for the QR book pages.
// The book cover is a button; tapping it (or any link to #story-audio, such
// as the Story Audio card) opens a popup with the YouTube player. Nothing
// from YouTube is downloaded until the popup opens.
// Page config: window.STORY_AUDIO = { videoId, start, end, title }
(function () {
  const cfg = window.STORY_AUDIO;
  const coverBtn = document.getElementById("story-audio-btn");
  if (!cfg || !cfg.videoId || !coverBtn) return;

  const start = cfg.start || 0;
  const end = cfg.end || 0;
  let apiPromise = null;
  let overlay = null;
  let player = null;
  let endTimer = null;
  let stuckTimer = null;
  let opener = null;

  function loadYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === "function") previous();
        resolve();
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => {
        apiPromise = null;
        tag.remove();
        reject(new Error("YouTube API failed to load"));
      };
      document.head.appendChild(tag);
    });
    return apiPromise;
  }

  function openPopup() {
    if (overlay) return;
    opener = document.activeElement;

    overlay = document.createElement("div");
    overlay.className = "ak-overlay story-audio-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "story-audio-title");
    overlay.innerHTML = `
      <div class="ak-modal story-audio-modal">
        <div class="ak-modal-header">
          <h2 class="ak-modal-title" id="story-audio-title"></h2>
          <button type="button" class="ak-close" data-act="close" aria-label="Close story audio">✕</button>
        </div>
        <div class="story-audio-frame"><div id="story-audio-player"></div></div>
        <p class="story-audio-status" aria-live="polite">Loading…</p>
        <div class="story-audio-controls">
          <button type="button" class="story-audio-ctrl" data-act="toggle" disabled>Pause</button>
          <button type="button" class="story-audio-ctrl" data-act="replay" disabled>Replay</button>
        </div>
      </div>`;
    overlay.querySelector("#story-audio-title").textContent = cfg.title || "Story Audio";

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) return closePopup();
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "close") closePopup();
      else if (act === "toggle") togglePlay();
      else if (act === "replay") replay();
    });

    document.body.appendChild(overlay);
    document.documentElement.classList.add("story-audio-open");
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("focusin", keepFocusInside);
    requestAnimationFrame(() => overlay && overlay.classList.add("open"));
    overlay.querySelector('[data-act="close"]').focus();

    const popup = overlay;
    loadYouTubeApi()
      .then(() => {
        if (overlay !== popup) return; // closed while loading
        player = new YT.Player("story-audio-player", {
          videoId: cfg.videoId,
          playerVars: {
            start: start,
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            origin: location.origin,
          },
          events: { onReady: onReady, onStateChange: onStateChange },
        });
      })
      .catch(() => {
        if (overlay !== popup) return;
        const url = `https://www.youtube.com/watch?v=${cfg.videoId}&t=${start}s`;
        setStatus(
          `Sorry, the audio couldn't load. <a href="${url}" target="_blank" rel="noopener">Open it on YouTube</a>`,
          true
        );
      });
  }

  function onReady(e) {
    e.target.unMute();
    e.target.setVolume(100);
    e.target.playVideo();
    overlay.querySelectorAll(".story-audio-ctrl").forEach((b) => (b.disabled = false));
    setStatus("");
    // Some phones block sound until the video itself is tapped.
    stuckTimer = setTimeout(() => {
      if (player && player.getPlayerState() !== YT.PlayerState.PLAYING) {
        setStatus("If it doesn't start, tap ▶ on the video.");
      }
    }, 2500);
  }

  function onStateChange(e) {
    const playing = e.data === YT.PlayerState.PLAYING;
    const toggle = overlay && overlay.querySelector('[data-act="toggle"]');
    if (toggle) toggle.textContent = playing ? "Pause" : "Play";
    clearInterval(endTimer);
    if (playing) {
      setStatus("");
      if (end) {
        endTimer = setInterval(() => {
          if (player.getCurrentTime() >= end) {
            player.pauseVideo();
            player.seekTo(start, true);
          }
        }, 500);
      }
    }
  }

  function togglePlay() {
    if (!player || !player.getPlayerState) return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }

  function replay() {
    if (!player || !player.seekTo) return;
    player.seekTo(start, true);
    player.playVideo();
  }

  function closePopup() {
    if (!overlay) return;
    clearInterval(endTimer);
    clearTimeout(stuckTimer);
    if (player) {
      try {
        player.stopVideo();
        player.destroy();
      } catch (_) {}
      player = null;
    }
    const closing = overlay;
    overlay = null;
    closing.remove();
    document.documentElement.classList.remove("story-audio-open");
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("focusin", keepFocusInside);
    (opener && opener.isConnected ? opener : coverBtn).focus();
    opener = null;
  }

  function onKeydown(e) {
    if (e.key === "Escape") closePopup();
  }

  function keepFocusInside(e) {
    if (overlay && !overlay.contains(e.target)) {
      overlay.querySelector('[data-act="close"]').focus();
    }
  }

  function setStatus(text, isHtml) {
    const el = overlay && overlay.querySelector(".story-audio-status");
    if (!el) return;
    if (isHtml) el.innerHTML = text;
    else el.textContent = text;
  }

  coverBtn.addEventListener("click", openPopup);
  document.addEventListener("click", (e) => {
    if (e.target.closest('a[href="#story-audio"]')) {
      e.preventDefault();
      openPopup();
    }
  });
  window.addEventListener("pagehide", closePopup);
})();
