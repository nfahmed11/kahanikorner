import { vocab as originalVocab } from "./mastervocab.js";

function startHeaderTitleRotation() {
  const el = document.getElementById("header-title");
  if (!el) return;

  const frames = [
    { text: "Main Kaun Hoon?", lang: "roman" },
    { text: "میں کون ہوں؟", lang: "urdu" },
    { text: "Who Am I?", lang: "english" },
  ];

  let idx = 0;
  el.textContent = frames[idx].text;
  el.classList.toggle("is-urdu", frames[idx].lang === "urdu");

  setInterval(() => {
    el.classList.add("is-fading");

    setTimeout(() => {
      idx = (idx + 1) % frames.length;
      el.textContent = frames[idx].text;
      el.classList.toggle("is-urdu", frames[idx].lang === "urdu");
      el.classList.remove("is-fading");
    }, 180);
  }, 3200);
}

let deck = [];
let currentCard = null;

let difficultyValue = 2;
let currentDifficulty = "Hard";

let streak = 0;
const correctlyAnsweredIds = new Set();

const PRAISE_LABELS = [
  "Shabash! 🌟",
  "Wah! ✨",
  "Boht khoob! 💛",
  "Mashallah! 🌙",
  "Zabardast! 🎉",
  "Aap ne kar dikhaya! ⭐"
];

const FRIENDLY_STATUS = {
  choose: "Can you find the right word?",
  type: "Type the answer below",
  wrong: "Oops, try another one!",
  noWords: "Uh-oh, no words loaded here yet.",
  noLanguages: "Pick at least one language first.",
  noRiddles: "I couldn’t find a clue for these settings.",
  hint: "Here’s a little clue!",
  answerShown: "Here’s the answer 💛",
  complete: "Yay! You finished them all! 🌟",
  exactFirst: "Type an answer first 💭",
  almost: "So close — try again!",
  confirm: "That looks close — check below 👇",
  retryType: "Type the answer below",
  good: "You got it! ✨"
};

function iconCheck() {
  return `
    <span class="btn__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l1.8 4.6L19 9.1l-4 3.2 1.3 5-4.3-2.6-4.3 2.6 1.3-5-4-3.2 5.2-1.5L12 3z"/>
      </svg>
    </span>
  `;
}

function iconHint() {
  return `
    <span class="btn__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="6.5"></circle>
        <path d="M16 16l4 4"></path>
      </svg>
    </span>
  `;
}

function iconReveal() {
  return `
    <span class="btn__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path>
        <circle cx="12" cy="12" r="2.8"></circle>
      </svg>
    </span>
  `;
}

function iconNext() {
  return `
    <span class="btn__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14"></path>
        <path d="M13 6l6 6-6 6"></path>
      </svg>
    </span>
  `;
}

function btnLabel(iconMarkup, text) {
  return `<span class="btn__content">${iconMarkup}<span>${text}</span></span>`;
}

function launchConfetti(count = 40) {
  const container = document.createElement("div");
  container.className = "confetti-container";

  const colors = ["#ffe38b", "#90dfb1", "#92c9ff", "#f5a2bb", "#b9a7f5", "#ffffff"];
  const sizes = [8, 10, 12, 14];

  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.className = "confetti";

    const size = sizes[Math.floor(Math.random() * sizes.length)];
    const isCircle = Math.random() > 0.55;
    const drift = (Math.random() - 0.5) * 70;
    const spinDir = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 260);

    c.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${isCircle ? size : size * 0.65}px;
      background-color: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${isCircle ? "50%" : "4px"};
      animation-duration: ${1 + Math.random() * 1.2}s;
      animation-delay: ${Math.random() * 0.2}s;
      opacity: ${0.78 + Math.random() * 0.2};
    `;

    c.style.setProperty("--drift", `${drift}px`);
    c.style.setProperty("--spin", `${spinDir}deg`);

    container.appendChild(c);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 2400);
}

function flashScreen(color, alpha = 0.1, durationMs = 280) {
  const el = document.createElement("div");
  el.className = "flash-overlay";
  Object.assign(el.style, {
    background: color,
    opacity: String(alpha),
    transition: `opacity ${durationMs}ms ease-out`,
  });

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), durationMs + 30);
    }, 60);
  });
}

function burstEmojis(emojis, clientX, clientY, count = 6) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "emoji-burst";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];

    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.45;
    const dist = 50 + Math.random() * 60;
    const ex = Math.cos(angle) * dist;
    const ey = Math.sin(angle) * dist - 30;
    const dur = 580 + Math.random() * 240;

    Object.assign(el.style, {
      left: `${clientX}px`,
      top: `${clientY}px`,
    });

    el.style.setProperty("--ex", `${ex}px`);
    el.style.setProperty("--ey", `${ey}px`);
    el.style.setProperty("--fly-dur", `${dur}ms`);

    document.body.appendChild(el);
    setTimeout(() => el.remove(), dur + 80);
  }
}

function burstSparkles(clientX, clientY, count = 8) {
  const sparkles = ["🍬", "🍭", "✨", "⭐"];

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "sparkle-burst";
    el.textContent = sparkles[Math.floor(Math.random() * sparkles.length)];

    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.35;
    const dist = 36 + Math.random() * 56;
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * dist - 28;
    const dur = 700 + Math.random() * 220;

    Object.assign(el.style, {
      left: `${clientX}px`,
      top: `${clientY}px`,
      color: ["#f7ca4e", "#92c9ff", "#f5a2bb", "#90dfb1"][Math.floor(Math.random() * 4)]
    });

    el.style.setProperty("--sx", `${sx}px`);
    el.style.setProperty("--sy", `${sy}px`);
    el.style.setProperty("--sparkle-dur", `${dur}ms`);

    document.body.appendChild(el);
    setTimeout(() => el.remove(), dur + 80);
  }
}

function showPraiseBubble(clientX, clientY) {
  const bubble = document.createElement("div");
  bubble.className = "praise-bubble";
  bubble.textContent = PRAISE_LABELS[Math.floor(Math.random() * PRAISE_LABELS.length)];
  bubble.style.left = `${clientX}px`;
  bubble.style.top = `${clientY - 12}px`;
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 980);
}

function updateStreakBadge() {
  const badge = document.getElementById("streak-badge");
  if (!badge) return;

  if (streak < 2) {
    badge.classList.remove("visible");
    badge.textContent = "";
    return;
  }

  const icon = streak >= 10 ? "🌟" : streak >= 5 ? "🔥" : "✨";
  badge.textContent = `${icon} ${streak} streak`;
  badge.classList.add("visible");

  badge.classList.remove("pulse");
  badge.offsetHeight;
  badge.classList.add("pulse");
}

function correctReaction(clientX, clientY, cardEl = null) {
  const emojis = ["🎉", "✨", "🌟", "🎊"];
  const count = streak >= 5 ? 9 : 6;

  flashScreen("#f7ca4e", 0.12);
  burstEmojis(emojis, clientX, clientY, count);
  burstSparkles(clientX, clientY, streak >= 5 ? 12 : 8);
  showPraiseBubble(clientX, clientY);

  if (cardEl) {
    cardEl.classList.remove("pop-correct");
    cardEl.offsetHeight;
    cardEl.classList.add("pop-correct");
  }

  launchConfetti(streak >= 5 ? 70 : 44);
}

function wrongReaction(clientX, clientY) {
  const emojis = ["🤍", "🙂", "💭"];
  flashScreen("#f5a2bb", 0.1);
  burstEmojis(emojis, clientX, clientY, 4);
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

function loadSettings(difficultyRange, languageCheckboxes) {
  try {
    const diff = localStorage.getItem("riddle_difficulty");
    const langRoman = localStorage.getItem("riddle_lang_romanurdu");
    const langUrdu = localStorage.getItem("riddle_lang_urdu");
    const langEng = localStorage.getItem("riddle_lang_english");

    if (diff !== null && difficultyRange) difficultyRange.value = diff;

    if (langRoman !== null && languageCheckboxes.romanUrdu) {
      languageCheckboxes.romanUrdu.checked = langRoman !== "false";
    }
    if (langUrdu !== null && languageCheckboxes.urdu) {
      languageCheckboxes.urdu.checked = langUrdu !== "false";
    }
    if (langEng !== null && languageCheckboxes.english) {
      languageCheckboxes.english.checked = langEng !== "false";
    }
  } catch {}
}

function getRomanForms(card) {
  if (!card) return [];

  const forms = [];
  if (card.word?.baseRomanUrdu) forms.push(card.word.baseRomanUrdu);

  if (Array.isArray(card.variants)) {
    card.variants.forEach((variant) => {
      if (variant?.romanUrdu) forms.push(variant.romanUrdu);
    });
  }

  return [...new Set(forms)];
}

function getBaseRoman(card) {
  return card?.word?.baseRomanUrdu || "";
}

function getUrdu(card) {
  return card?.word?.baseUrdu || "";
}

function getEnglish(card) {
  return card?.word?.english || "";
}

function displayRoman(card) {
  const forms = getRomanForms(card);
  const matched = forms.find((w) => window.ALLOWED_WORDS?.has(w));
  return matched || getBaseRoman(card) || "";
}

function normalizeRomanUrdu(input) {
  if (!input) return "";

  let s = String(input).trim().toLowerCase();

  s = s
    .replace(/a{2,}/g, "a")
    .replace(/e{2,}/g, "i")
    .replace(/i{2,}/g, "i")
    .replace(/o{2,}/g, "u")
    .replace(/u{2,}/g, "u");

  return s.replace(/\s+/g, " ").trim();
}

function levenshtein(a, b) {
  const s = a ?? "";
  const t = b ?? "";
  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const si = s.charCodeAt(i - 1);

    for (let j = 1; j <= n; j++) {
      const cost = si === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }

    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }

  return prev[n];
}

function getDistanceThreshold(s) {
  return (s || "").length <= 5 ? 1 : 2;
}

function shuffleArray(arr) {
  const copy = [...arr];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function sliderValueToDifficulty(v) {
  const n = Number(v);
  if (n <= 0) return "Easy";
  if (n === 1) return "Medium";
  return "Hard";
}

function getOptionCountForDifficulty(diff) {
  const isSmallScreen = window.innerWidth <= 560;

  if (isSmallScreen) {
    if (diff === "Easy") return 4;
    if (diff === "Medium") return 6;
    return 10;
  }

  if (diff === "Easy") return 3;
  if (diff === "Medium") return 5;
  return 10;
}

function resetDeck() {
  const ALLOWED = window.ALLOWED_WORDS;

  if (!Array.isArray(originalVocab)) {
    deck = [];
    return;
  }

  if (!(ALLOWED instanceof Set)) {
    deck = [];
    return;
  }

  deck = originalVocab.filter((card) =>
    getRomanForms(card).some((form) => ALLOWED.has(form))
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const riddlesContainer = document.getElementById("riddle-container");
  const wordOptions = document.getElementById("word-options");
  const statusCard = document.getElementById("status");
  const statusLine = document.getElementById("status-instruction");
  const answerArea = document.getElementById("answer-area");

  const settingsDropdown = document.getElementById("settings-dropdown");
  const settingsToggle = document.getElementById("settings-toggle");
  const arrow = document.getElementById("settings-arrow");
  const settingsModal = document.getElementById("settings-modal");
  const settingsModalBody = document.getElementById("settings-modal-body");
  const settingsModalBackdrop = document.getElementById("settings-modal-backdrop");
  const settingsModalClose = document.getElementById("settings-modal-close");
  const settingsModalDone = document.getElementById("settings-modal-done");

  const difficultyRange = document.getElementById("difficulty-range");
  const difficultyLabel = document.getElementById("difficulty-label");

  const languageCheckboxes = {
    romanUrdu: document.getElementById("romanUrdu"),
    urdu: document.getElementById("urdu"),
    english: document.getElementById("english"),
  };

  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const toyCardClasses = [
    "word--toy-blue",
    "word--toy-yellow",
    "word--toy-pink",
    "word--toy-mint"
  ];

  loadSettings(difficultyRange, languageCheckboxes);
  startHeaderTitleRotation();
  resetDeck();

  function setStatus(text, tone = "neutral") {
    if (statusLine) statusLine.textContent = text || "";
    if (!statusCard) return;

    statusCard.classList.remove("is-good", "is-bad");
    statusCard.offsetHeight;

    if (tone === "good") statusCard.classList.add("is-good");
    if (tone === "bad") statusCard.classList.add("is-bad");
  }

  function showAnswerArea(show) {
    if (!answerArea) return;
    answerArea.classList.toggle("visible", Boolean(show));
    if (!show) answerArea.innerHTML = "";
  }

  if (!deck.length) {
    if (wordOptions) wordOptions.style.display = "none";
    if (riddlesContainer) riddlesContainer.innerHTML = "<p>No words loaded.</p>";
    setStatus(FRIENDLY_STATUS.noWords, "bad");
    return;
  }

  function openDropdown() {
    settingsDropdown?.classList.add("visible");
    settingsDropdown?.setAttribute("aria-hidden", "false");
    settingsToggle?.setAttribute("aria-expanded", "true");
    arrow?.classList.add("rotated");
  }

  function closeDropdown() {
    settingsDropdown?.classList.remove("visible");
    settingsDropdown?.setAttribute("aria-hidden", "true");
    settingsToggle?.setAttribute("aria-expanded", "false");
    arrow?.classList.remove("rotated");
  }

  function openModal() {
    if (settingsDropdown && settingsModalBody) {
      settingsModalBody.append(...Array.from(settingsDropdown.children));
    }
    settingsModal?.classList.remove("hidden");
    arrow?.classList.add("rotated");
    settingsToggle?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (settingsDropdown && settingsModalBody) {
      settingsDropdown.append(...Array.from(settingsModalBody.children));
    }
    settingsModal?.classList.add("hidden");
    arrow?.classList.remove("rotated");
    settingsToggle?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  if (isTouchDevice) {
    settingsToggle?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    settingsModalBackdrop?.addEventListener("click", closeModal);
    settingsModalClose?.addEventListener("click", closeModal);
    settingsModalDone?.addEventListener("click", closeModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  } else {
    settingsToggle?.addEventListener("click", (e) => {
      e.preventDefault();
      settingsDropdown?.classList.contains("visible") ? closeDropdown() : openDropdown();
    });

    document.addEventListener("click", (e) => {
      if (!settingsToggle?.contains(e.target) && !settingsDropdown?.contains(e.target)) {
        closeDropdown();
      }
    });
  }

  function getSelectedLanguages() {
    return Object.keys(languageCheckboxes).filter((key) => languageCheckboxes[key]?.checked);
  }

  function cardHasRiddleForUI(card) {
    const r = card?.riddles;
    if (!r) return false;

    if (languageCheckboxes.romanUrdu.checked && r.romanUrdu) return true;
    if (languageCheckboxes.urdu.checked && r.urdu) return true;
    if (languageCheckboxes.english.checked && r.english) return true;

    return false;
  }

  function getRandomCard() {
    const filtered = deck.filter((card) => card?.riddles && cardHasRiddleForUI(card));
    if (!filtered.length) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  function renderRiddle(card) {
    const r = card?.riddles;
    const langs = getSelectedLanguages();

    if (!riddlesContainer) return false;

    riddlesContainer.innerHTML = "";

    if (!langs.length) {
      riddlesContainer.innerHTML = "<p>Please select at least one language.</p>";
      return false;
    }

    const box = document.createElement("div");
    box.className = "riddle-box";

    if (languageCheckboxes.romanUrdu.checked && r?.romanUrdu) {
      const p = document.createElement("p");
      p.className = "roman-text";
      p.textContent = r.romanUrdu;
      box.appendChild(p);
    }

    if (languageCheckboxes.urdu.checked && r?.urdu) {
      const p = document.createElement("p");
      p.className = "urdu-text";
      p.textContent = r.urdu;
      box.appendChild(p);
    }

    if (languageCheckboxes.english.checked && r?.english) {
      const p = document.createElement("p");
      p.className = "english-text";
      p.textContent = r.english;
      box.appendChild(p);
    }

    riddlesContainer.appendChild(box);
    return true;
  }

  function getRandomIncorrectCards(count, correctCard) {
    const pool = deck.filter((c) => c?.id && c.id !== correctCard?.id);
    return shuffleArray(pool).slice(0, count);
  }

  function checkCompletion() {
    if (!deck.length) return false;
    return deck.every((card) => correctlyAnsweredIds.has(card.id));
  }

  function showCompletionScreen() {
    if (riddlesContainer) {
      riddlesContainer.innerHTML = `
        <div class="completion-screen">
          <div class="completion-screen__illustration" aria-hidden="true">🍬 ✨ 🍭</div>
          <h2>Yay! You did it!</h2>
          <p>All ${deck.length} word${deck.length === 1 ? "" : "s"} answered correctly.</p>
          <button class="btn btn--primary" id="restart-btn" type="button">
            ${btnLabel(iconNext(), "Play Again")}
          </button>
        </div>
      `;
    }

    document.getElementById("restart-btn")?.addEventListener("click", () => {
      correctlyAnsweredIds.clear();
      streak = 0;
      updateStreakBadge();
      updateRiddle();
    });

    if (wordOptions) {
      wordOptions.innerHTML = "";
      wordOptions.style.display = "none";
    }

    showAnswerArea(false);
    setStatus(FRIENDLY_STATUS.complete, "good");
    launchConfetti(90);
    flashScreen("#ffe38b", 0.2);
  }

  function renderAnswerUIForCurrentCard() {
    if (!currentCard?.word || !wordOptions) return;

    showAnswerArea(false);

    if (currentDifficulty === "Hard") {
      wordOptions.style.display = "none";
      wordOptions.innerHTML = "";
      setStatus(FRIENDLY_STATUS.type);
      renderHardModeUI();
      return;
    }

    setStatus(FRIENDLY_STATUS.choose);
    renderMultipleChoiceUI();
  }

  function renderMultipleChoiceUI() {
    if (!wordOptions || !currentCard) return;

    wordOptions.style.display = "grid";
    wordOptions.innerHTML = "";

    const correct = currentCard;
    const wordCount = getOptionCountForDifficulty(currentDifficulty);
    const incorrects = getRandomIncorrectCards(wordCount - 1, correct);
    const options = shuffleArray([correct, ...incorrects]);

    let locked = false;

    options.forEach((card, index) => {
      const romanUrdu = displayRoman(card);
      const urdu = getUrdu(card);
      const image = card.image || "/qr/assets/images/noimage.png";

      const el = document.createElement("div");
      el.className = `word ${toyCardClasses[index % toyCardClasses.length]}`;
      el.style.animationDelay = `${index * 45}ms`;

      el.innerHTML = `
        <p class="roman-text">${romanUrdu}</p>
        <img
          src="${image}"
          alt="${romanUrdu}"
          class="option-image"
          onerror="this.onerror=null;this.src='/qr/assets/images/noimage.png';"
        />
        <p class="urdu-text">${urdu}</p>
      `;

      el.addEventListener("click", (e) => {
        if (locked) return;

        const cx = e.clientX || el.getBoundingClientRect().left + el.offsetWidth / 2;
        const cy = e.clientY || el.getBoundingClientRect().top + el.offsetHeight / 2;

        if (card.id === correct.id) {
          locked = true;
          el.classList.add("correct");

          const riddleBox = riddlesContainer?.querySelector(".riddle-box");
          if (riddleBox) {
            riddleBox.classList.add("glow-correct");
            setTimeout(() => riddleBox.classList.remove("glow-correct"), 760);
          }

          wordOptions.querySelectorAll(".word:not(.correct)").forEach((word) => {
            word.classList.add("dimmed");
          });

          if (currentCard?.id) correctlyAnsweredIds.add(currentCard.id);

          streak += 1;
          updateStreakBadge();

          const msg =
            streak >= 10 ? `🌟 ${streak} in a row — Mashallah!` :
            streak >= 5 ? `✨ ${streak} in a row — boht khoob!` :
            streak >= 3 ? `⭐ ${streak} in a row!` :
            FRIENDLY_STATUS.good;

          setStatus(msg, "good");
          correctReaction(cx, cy, el);

          setTimeout(() => updateRiddle(), 980);
        } else {
          el.classList.add("incorrect");
          streak = 0;
          updateStreakBadge();
          setStatus(FRIENDLY_STATUS.wrong, "bad");
          wrongReaction(cx, cy);

          setTimeout(() => {
            el.classList.remove("incorrect");
            setStatus(FRIENDLY_STATUS.choose);
          }, 650);
        }
      });

      wordOptions.appendChild(el);
    });
  }

  function renderHardModeUI() {
    if (!answerArea || !currentCard) return;

    wordOptions.style.display = "none";
    wordOptions.innerHTML = "";
    showAnswerArea(true);

    const correctRoman = getBaseRoman(currentCard);
    const correctUrdu = getUrdu(currentCard);
    const englishWord = getEnglish(currentCard);
    const image = currentCard?.image ?? "";
    const normalizedCorrect = normalizeRomanUrdu(correctRoman);
    const threshold = getDistanceThreshold(normalizedCorrect);

    const hintSteps = [
      image ? { key: "image", label: "Image" } : null,
      { key: "firstLetter", label: "First letter" },
      { key: "firstTwoLetters", label: "First 2 letters" },
      englishWord ? { key: "english", label: "English" } : null,
    ].filter(Boolean);

    let revealedHintCount = 0;
    let revealAnswerUsed = false;

    const hintDotsHTML = hintSteps
      .map((_, i) => `<div class="hint-dot" data-hi="${i}"></div>`)
      .join("");

    answerArea.innerHTML = `
      <div class="hard-wrap">
        <input
          id="hard-answer-input"
          class="hard-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Type your answer"
        />

        <div id="hard-feedback" class="hard-feedback"></div>

        <div id="hard-hint-area" class="hard-hint-area">
          <div class="hint-dots" id="hint-dots">${hintDotsHTML}</div>
          <div class="hard-hints-stack" id="hint-stack"></div>
        </div>

        <div id="hard-actions" class="hard-actions">
          <button id="hard-submit-btn" class="btn btn--check" type="button">
            ${btnLabel(iconCheck(), "Check")}
          </button>
          <button id="hard-progress-hint-btn" class="btn btn--hint" type="button">
            ${btnLabel(iconHint(), "Get Hint")}
          </button>
          <button id="hard-reveal-btn" class="btn btn--reveal" type="button">
            ${btnLabel(iconReveal(), "Reveal")}
          </button>
        </div>
      </div>
    `;

    const input = document.getElementById("hard-answer-input");
    const feedback = document.getElementById("hard-feedback");
    const hintStack = document.getElementById("hint-stack");
    const submitBtn = document.getElementById("hard-submit-btn");
    const progressHintBtn = document.getElementById("hard-progress-hint-btn");
    const revealBtn = document.getElementById("hard-reveal-btn");

    function setHardMsg(msg) {
      if (feedback) feedback.textContent = msg || "";
    }

    function refreshHintDots() {
      answerArea.querySelectorAll(".hint-dot").forEach((dot, i) => {
        dot.classList.toggle("filled", i < revealedHintCount);
      });
    }

    function renderHintStack() {
      if (!hintStack) return;

      if (revealedHintCount === 0 && !revealAnswerUsed) {
        hintStack.innerHTML = "";
        return;
      }

      const showImage = revealAnswerUsed
        ? Boolean(image)
        : hintSteps.some((step, index) => step.key === "image" && index < revealedHintCount);

      const showFirstLetter = revealAnswerUsed
        ? true
        : hintSteps.some((step, index) => step.key === "firstLetter" && index < revealedHintCount);

      const showSecondLetter = revealAnswerUsed
        ? true
        : hintSteps.some((step, index) => step.key === "firstTwoLetters" && index < revealedHintCount);

      const showEnglish = revealAnswerUsed
        ? Boolean(englishWord)
        : hintSteps.some((step, index) => step.key === "english" && index < revealedHintCount);

      let lettersText = "";
      if (showSecondLetter) {
        lettersText = correctRoman.slice(0, 2);
      } else if (showFirstLetter) {
        lettersText = correctRoman.charAt(0);
      }

      hintStack.innerHTML = `
        <div class="unified-hint-box">
          ${
            showImage
              ? `
                <div class="unified-hint-box__image-wrap">
                  <img
                    src="${image || "/qr/assets/images/noimage.png"}"
                    onerror="this.onerror=null;this.src='/qr/assets/images/noimage.png';"
                    alt="hint"
                    class="unified-hint-box__image"
                  />
                </div>
              `
              : ""
          }
          <div class="unified-hint-box__letters">${lettersText}</div>
          <div class="unified-hint-box__english">${showEnglish ? englishWord : ""}</div>
          ${
            revealAnswerUsed
              ? `
                <div class="unified-hint-box__answer-roman">${correctRoman}</div>
                <div class="unified-hint-box__answer-urdu">${correctUrdu}</div>
              `
              : ""
          }
        </div>
      `;
    }

    function updateHintButtonLabel() {
      if (!progressHintBtn) return;

      if (revealedHintCount >= hintSteps.length) {
        progressHintBtn.innerHTML = btnLabel(iconHint(), "No More Hints");
        progressHintBtn.disabled = true;
        return;
      }

      progressHintBtn.innerHTML = btnLabel(iconHint(), `Get ${hintSteps[revealedHintCount].label} Hint`);
    }

    function revealNextHint() {
      if (revealedHintCount >= hintSteps.length) {
        setHardMsg("No more hints left.");
        return;
      }

      revealedHintCount += 1;
      refreshHintDots();
      renderHintStack();
      updateHintButtonLabel();

      setHardMsg(FRIENDLY_STATUS.hint);
      setStatus(FRIENDLY_STATUS.hint);
    }

    function revealFinal() {
      revealAnswerUsed = true;
      revealedHintCount = hintSteps.length;

      refreshHintDots();
      renderHintStack();
      updateHintButtonLabel();

      setHardMsg(FRIENDLY_STATUS.answerShown);
      setStatus(FRIENDLY_STATUS.answerShown);

      const actions = document.getElementById("hard-actions");
      if (!actions) return;

      actions.innerHTML = `
        <button id="hard-next-btn" class="btn btn--primary" type="button">
          ${btnLabel(iconNext(), "Next Riddle")}
        </button>
      `;

      document.getElementById("hard-next-btn")?.addEventListener("click", updateRiddle);
    }

    function shakeInput() {
      if (!input) return;
      input.classList.remove("is-shaking");
      input.offsetHeight;
      input.classList.add("is-shaking");
      setTimeout(() => input.classList.remove("is-shaking"), 300);
    }

    function resetButtons() {
      const actions = document.getElementById("hard-actions");
      if (!actions) return;

      actions.innerHTML = `
        <button id="hard-submit-btn" class="btn btn--check" type="button">
          ${btnLabel(iconCheck(), "Check")}
        </button>
        <button id="hard-progress-hint-btn" class="btn btn--hint" type="button">
          ${btnLabel(iconHint(), "Get Hint")}
        </button>
        <button id="hard-reveal-btn" class="btn btn--reveal" type="button">
          ${btnLabel(iconReveal(), "Reveal")}
        </button>
      `;

      document.getElementById("hard-submit-btn")?.addEventListener("click", handleSubmit);
      document.getElementById("hard-progress-hint-btn")?.addEventListener("click", revealNextHint);
      document.getElementById("hard-reveal-btn")?.addEventListener("click", revealFinal);

      updateHintButtonLabel();
    }

    function showSuggestionFlow() {
      const actions = document.getElementById("hard-actions");
      if (!actions) return;

      actions.innerHTML = `
        <button id="hard-yes-btn" class="btn btn--primary" type="button">
          ${btnLabel(iconCheck(), "Yes, that's it")}
        </button>
        <button id="hard-tryagain-btn" class="btn" type="button">Try Again</button>
        <button id="hard-progress-hint-btn" class="btn btn--hint" type="button">
          ${btnLabel(iconHint(), "Get Hint")}
        </button>
        <button id="hard-reveal-btn" class="btn btn--reveal" type="button">
          ${btnLabel(iconReveal(), "Reveal")}
        </button>
      `;

      const inputRect = input?.getBoundingClientRect();
      const cx = inputRect ? inputRect.left + inputRect.width / 2 : window.innerWidth / 2;
      const cy = inputRect ? inputRect.top + inputRect.height / 2 : window.innerHeight / 2;

      document.getElementById("hard-yes-btn")?.addEventListener("click", () => {
        if (currentCard?.id) correctlyAnsweredIds.add(currentCard.id);

        streak += 1;
        updateStreakBadge();

        const msg =
          streak >= 5 ? `✨ ${streak} in a row — boht khoob!` :
          streak >= 3 ? `⭐ ${streak} in a row!` :
          FRIENDLY_STATUS.good;

        setStatus(msg, "good");
        setHardMsg(FRIENDLY_STATUS.good);
        correctReaction(cx, cy);

        setTimeout(() => updateRiddle(), 980);
      });

      document.getElementById("hard-tryagain-btn")?.addEventListener("click", () => {
        setHardMsg(FRIENDLY_STATUS.retryType);
        setStatus(FRIENDLY_STATUS.retryType);
        resetButtons();
        input?.focus();
        input?.select();
      });

      document.getElementById("hard-progress-hint-btn")?.addEventListener("click", revealNextHint);
      document.getElementById("hard-reveal-btn")?.addEventListener("click", revealFinal);

      updateHintButtonLabel();
    }

    function handleSubmit() {
      const typed = input?.value ?? "";
      const normalizedTyped = normalizeRomanUrdu(typed);

      if (!normalizedTyped) {
        setHardMsg(FRIENDLY_STATUS.exactFirst);
        setStatus(FRIENDLY_STATUS.exactFirst, "bad");
        shakeInput();
        input?.focus();
        return;
      }

      if (normalizedTyped === normalizedCorrect) {
        const rect = input?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

        if (currentCard?.id) correctlyAnsweredIds.add(currentCard.id);

        streak += 1;
        updateStreakBadge();

        const msg =
          streak >= 5 ? `✨ ${streak} in a row — boht khoob!` :
          streak >= 3 ? `⭐ ${streak} in a row!` :
          FRIENDLY_STATUS.good;

        setStatus(msg, "good");
        setHardMsg(FRIENDLY_STATUS.good);
        correctReaction(cx, cy);

        setTimeout(() => updateRiddle(), 980);
        return;
      }

      const dist = levenshtein(normalizedTyped, normalizedCorrect);

      if (dist <= threshold) {
        setHardMsg(FRIENDLY_STATUS.confirm);
        setStatus(FRIENDLY_STATUS.confirm);
        showSuggestionFlow();
        return;
      }

      const rect = input?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

      setHardMsg(FRIENDLY_STATUS.almost);
      setStatus(FRIENDLY_STATUS.almost, "bad");
      shakeInput();
      wrongReaction(cx, cy);
      input?.focus();
      input?.select();
    }

    submitBtn?.addEventListener("click", handleSubmit);
    progressHintBtn?.addEventListener("click", revealNextHint);
    revealBtn?.addEventListener("click", revealFinal);

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    });

    progressHintBtn.innerHTML = btnLabel(iconHint(), "Get Hint");
    revealBtn.innerHTML = btnLabel(iconReveal(), "Reveal");
    submitBtn.innerHTML = btnLabel(iconCheck(), "Check");

    updateHintButtonLabel();
    setTimeout(() => input?.focus(), 0);
  }

  function updateRiddle() {
    const langs = getSelectedLanguages();

    if (!riddlesContainer || !wordOptions) return;

    if (!langs.length) {
      riddlesContainer.innerHTML = "<p>Please select at least one language.</p>";
      wordOptions.innerHTML = "";
      wordOptions.style.display = "none";
      showAnswerArea(false);
      setStatus(FRIENDLY_STATUS.noLanguages, "bad");
      return;
    }

    if (checkCompletion()) {
      showCompletionScreen();
      return;
    }

    const MAX_TRIES = 80;
    let next = null;

    for (let i = 0; i < MAX_TRIES; i++) {
      const candidate = getRandomCard();
      if (candidate && cardHasRiddleForUI(candidate)) {
        next = candidate;
        break;
      }
    }

    if (!next) {
      riddlesContainer.innerHTML = "<p>No riddles found for the selected languages.</p>";
      wordOptions.innerHTML = "";
      wordOptions.style.display = "none";
      showAnswerArea(false);
      setStatus(FRIENDLY_STATUS.noRiddles, "bad");
      return;
    }

    currentCard = next;
    renderRiddle(currentCard);
    renderAnswerUIForCurrentCard();
  }

  function setDifficultyFromSlider(v) {
    difficultyValue = Number(v);
    currentDifficulty = sliderValueToDifficulty(difficultyValue);

    if (difficultyLabel) difficultyLabel.textContent = currentDifficulty;

    renderAnswerUIForCurrentCard();
  }

  if (difficultyRange) {
    setDifficultyFromSlider(difficultyRange.value);

    difficultyRange.addEventListener("input", (e) => {
      setDifficultyFromSlider(e.target.value);
      saveSetting("riddle_difficulty", e.target.value);
    });
  }

  Object.entries(languageCheckboxes).forEach(([key, cb]) => {
    cb?.addEventListener("change", () => {
      saveSetting(`riddle_lang_${key.toLowerCase()}`, cb.checked);
      updateRiddle();
    });
  });

  updateRiddle();
});