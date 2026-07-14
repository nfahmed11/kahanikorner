// Renders the shared audio newsletter template from window.AUDIONEWSLETTER_ISSUES
// (see audionewsletter-data.js), keyed by the ?issue=<slug> query param, then wires
// up page tabs + the audio player.

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;

const ACCENT_BY_POSITION = ["accent-coral", "accent-teal", "accent-sage", "accent-mustard"];
const BADGE_BY_TAG_CLASS = {
  story: "Main Story",
  advice: "Advice",
  vocab: "Vocabulary",
  letter: "Closing Notes",
};

function renderIssue(issue) {
  document.getElementById("docTitle").textContent = `${issue.title} — Audio Newsletter`;
  document.getElementById("storyTitle").textContent = issue.title;
  document.getElementById("mastheadKicker").textContent = `Audio Newsletter · ${issue.monthYear}`;

  const volNo = `Vol. ${String(issue.vol).padStart(2, "0")} · No. ${String(issue.no).padStart(2, "0")}`;
  document.getElementById("mastheadChips").innerHTML = `
    <span class="meta-chip">🎙 Audio Edition</span>
    <span class="meta-chip">${issue.monthYear}</span>
    <span class="meta-chip">${volNo}</span>
  `;

  const pageNav = document.getElementById("pageNav");
  const pageWrapper = document.getElementById("pageWrapper");

  pageNav.innerHTML = issue.pages
    .map((page, i) => {
      const tabLabel = page.sections[0].audio.replace(/\.[^.]+$/, "").toUpperCase();
      return `<button class="page-tab${i === 0 ? " active" : ""}" data-page="${i + 1}" type="button">${tabLabel}</button>`;
    })
    .join("");

  pageWrapper.innerHTML = issue.pages
    .map((page, i) => {
      const pageNum = i + 1;
      const accent = ACCENT_BY_POSITION[i];
      const badge = BADGE_BY_TAG_CLASS[page.tagClass];

      const sections = page.sections
        .map(
          (section) => `
            <button
              class="section-button ${accent}"
              type="button"
              data-audio="${issue.audioBase}${section.audio}"
              data-title="${section.title}">
              <span class="card-accent-bar"></span>
              <span class="icon">${ICON_SVG}</span>
              <span class="card-body">
                <span class="label-main">${section.title}</span>
                <span class="label-sub">${section.sub}</span>
                <span class="card-meta">
                  <span class="card-badge">${badge}</span>
                  <span class="tap-hint">Tap to listen →</span>
                </span>
              </span>
            </button>`
        )
        .join("");

      return `
        <section class="newsletter-page${pageNum === 1 ? " active" : ""}" data-page="${pageNum}">
          <div class="page-heading">
            <h2>${page.heading}</h2>
            <div class="page-tag ${page.tagClass}">${page.tag}</div>
          </div>
          <div class="section-grid">${sections}</div>
        </section>`;
    })
    .join("");
}

function initInteractions() {
  const pageTabs = document.querySelectorAll(".page-tab");
  const pages = document.querySelectorAll(".newsletter-page");

  const audioPlayer = document.getElementById("audioPlayer");
  const nowPlaying = document.getElementById("nowPlaying");
  const sectionButtons = document.querySelectorAll(".section-button");

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

  sectionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.dataset.audio;
      const title = btn.dataset.title || btn.innerText.trim();
      if (!src) return;

      const nextUrl = new URL(src, window.location.href).href;

      if (audioPlayer.src !== nextUrl) {
        audioPlayer.src = nextUrl;
      }

      audioPlayer.play().catch(() => {
        // autoplay might be blocked; user can press play
      });

      nowPlaying.innerHTML = `<strong>${title}</strong>`;
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const slug = new URL(window.location.href).searchParams.get("issue");
  const issues = window.AUDIONEWSLETTER_ISSUES || {};
  const issue = issues[slug] || issues[Object.keys(issues).pop()];

  if (!issue) return;

  renderIssue(issue);
  initInteractions();
});
