// riddles.js (FULL UPDATED)
// ✅ Centered UI (CSS-driven)
// ✅ Header wraps on small screens (CSS) so title can drop to its own line
// ✅ More "pop": correct option highlight + status pop/shake animations
// ✅ Dropzone removed
// ✅ SINGLE status line: uses ONLY #status-instruction (status-message removed)

function startHeaderTitleRotation() {
  const el = document.getElementById("header-title");
  if (!el) return;

  const frames = [
    { text: "Main Kaun Hoon?", lang: "roman" },
    { text: "میں کون ہوں؟", lang: "urdu" },
    { text: "Who Am I?", lang: "english" },
  ];

  let idx = 0;

  el.classList.add("is-in");
  el.classList.toggle("is-urdu", frames[idx].lang === "urdu");

  setInterval(() => {
    el.classList.remove("is-in");
    el.classList.add("is-out");

    setTimeout(() => {
      idx = (idx + 1) % frames.length;
      el.textContent = frames[idx].text;
      el.classList.toggle("is-urdu", frames[idx].lang === "urdu");
      el.classList.remove("is-out");
      el.classList.add("is-in");
    }, 220);
  }, 2400);
}

console.log("[riddle] script loaded");

// ✅ import your vocab file
import { vocab as originalVocab } from "./vocab.js";

// --------------------
// State + Deck
// --------------------
let deck = [];
let currentCard = null;

// difficulty slider values: 0=Easy, 1=Medium, 2=Hard
let difficultyValue = 2; // default HARD
let currentDifficulty = "Hard";

// --------------------
// Audio
// --------------------
const correctSound = new Audio("/qr/assets/audio/success.wav");
const incorrectSound = new Audio("/qr/assets/audio/incorrect.wav");

function playSound(sound) {
  try {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  } catch {}
}

function launchConfetti() {
  const confettiContainer = document.createElement("div");
  confettiContainer.className = "confetti-container";

  for (let i = 0; i < 36; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = `${Math.random() * 100}%`;
    c.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
    c.style.animationDuration = `${1.2 + Math.random() * 1.2}s`;
    c.style.opacity = `${0.7 + Math.random() * 0.3}`;
    confettiContainer.appendChild(c);
  }

  document.body.appendChild(confettiContainer);
  setTimeout(() => confettiContainer.remove(), 2200);
}

// --------------------
// Utils
// --------------------
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRomanForms(card) {
  const v = card?.word?.romanUrdu;
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function resetDeck() {
  // Read window.ALLOWED_WORDS here, not at module load time
  const ALLOWED_WORDS = window.ALLOWED_WORDS;

  if (!Array.isArray(originalVocab)) {
    console.error("[riddle] vocab import failed or not array", originalVocab);
    deck = [];
    return;
  }

  if (!(ALLOWED_WORDS instanceof Set)) {
    console.error("[riddle] window.ALLOWED_WORDS is not a Set. Make sure the ?words= param is in the URL.");
    deck = [];
    return;
  }

  // ✅ Build lookup of ALL vocab roman forms
  const vocabWords = new Set(
    originalVocab.flatMap((card) => getRomanForms(card))
  );

  // ✅ Filter deck correctly (supports arrays)
  deck = originalVocab.filter((card) =>
    getRomanForms(card).some((form) => ALLOWED_WORDS.has(form))
  );

  // ----------------------------
  // 🔥 LOGGING SECTION
  // ----------------------------
  console.log("========== RIDDLE DEBUG ==========");
  console.log("Total ALLOWED_WORDS:", ALLOWED_WORDS.size);
  console.log("ALLOWED_WORDS:", [...ALLOWED_WORDS]);
  console.log("Total vocab words available:", vocabWords.size);
  console.log("Total words loaded into deck:", deck.length);
  console.log(
    "Loaded words:",
    deck.map((card) => getRomanForms(card)[0])
  );

  const missing = [...ALLOWED_WORDS].filter((word) => !vocabWords.has(word));
  if (missing.length) {
    console.warn("❌ Words NOT found in vocab.js:", missing);
  } else {
    console.log("✅ All ALLOWED_WORDS found in vocab.js");
  }
  console.log("==================================");
}

function sliderValueToDifficulty(v) {
  const n = Number(v);
  if (n <= 0) return "Easy";
  if (n === 1) return "Medium";
  return "Hard";
}

function getOptionCountForDifficulty(diff) {
  if (diff === "Easy") return 3;
  if (diff === "Medium") return 5;
  return 10; // not used for Hard (typed)
}

// --------------------
// Hard Mode: normalization + fuzzy match
// --------------------
function normalizeRomanUrdu(input) {
  if (!input) return "";
  let s = String(input).trim().toLowerCase();

  // collapse repeated vowels
  s = s
    .replace(/a{2,}/g, "a")
    .replace(/e{2,}/g, "i")
    .replace(/i{2,}/g, "i")
    .replace(/o{2,}/g, "u")
    .replace(/u{2,}/g, "u");

  // normalize spacing
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function levenshtein(a, b) {
  const s = a ?? "";
  const t = b ?? "";
  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const si = s.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = si === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function getDistanceThreshold(normalizedCorrect) {
  const len = (normalizedCorrect || "").length;
  return len <= 5 ? 1 : 2;
}

// --------------------
// DOM + UI
// --------------------
document.addEventListener("DOMContentLoaded", () => {
  // Core DOM
  const riddlesContainer = document.getElementById("riddle-container");
  const wordOptions = document.getElementById("word-options");

  // Status + answer area
  const statusCard = document.getElementById("status");
  // ✅ single line (keep this ID in HTML). status-message is removed.
  const statusLine = document.getElementById("status-instruction");
  const answerArea = document.getElementById("answer-area");

  // Settings DOM
  const settingsDropdown = document.getElementById("settings-dropdown");
  const settingsToggle = document.getElementById("settings-toggle");
  const arrow = document.getElementById("settings-arrow");

  const settingsModal = document.getElementById("settings-modal");
  const settingsModalBody = document.getElementById("settings-modal-body");
  const settingsModalBackdrop = document.getElementById(
    "settings-modal-backdrop"
  );
  const settingsModalClose = document.getElementById("settings-modal-close");
  const settingsModalDone = document.getElementById("settings-modal-done");

  const difficultyRange = document.getElementById("difficulty-range");
  const difficultyLabel = document.getElementById("difficulty-label");

  const languageCheckboxes = {
    romanUrdu: document.getElementById("romanUrdu"),
    urdu: document.getElementById("urdu"),
    english: document.getElementById("english"),
  };

  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  startHeaderTitleRotation();

  // ✅ Single status API
  function setStatus(text, tone = "neutral") {
    if (statusLine) statusLine.textContent = text || "";

    if (!statusCard) return;
    statusCard.classList.remove("is-good", "is-bad");

    // Force restart animation if same class applied repeatedly
    // eslint-disable-next-line no-unused-expressions
    statusCard.offsetHeight;

    if (tone === "good") statusCard.classList.add("is-good");
    if (tone === "bad") statusCard.classList.add("is-bad");
  }

  function showAnswerArea(show) {
    if (!answerArea) return;
    answerArea.classList.toggle("visible", Boolean(show));
    if (!show) answerArea.innerHTML = "";
  }

  // Init deck — read window.ALLOWED_WORDS now that DOM is ready
  resetDeck();
  if (!deck.length) {
    setStatus("No words loaded (deck is empty)", "bad");
    wordOptions.style.display = "none";
    return;
  }

  // --------------------
  // Settings open/close
  // --------------------
  function openDropdown() {
    settingsDropdown?.classList.add("visible");
    settingsDropdown?.setAttribute("aria-hidden", "false");
    arrow?.classList.add("rotated");
  }

  function closeDropdown() {
    settingsDropdown?.classList.remove("visible");
    settingsDropdown?.setAttribute("aria-hidden", "true");
    arrow?.classList.remove("rotated");
  }

  function openModal() {
    if (settingsDropdown && settingsModalBody) {
      settingsModalBody.append(...Array.from(settingsDropdown.children));
    }
    settingsModal?.classList.remove("hidden");
    arrow?.classList.add("rotated");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (settingsDropdown && settingsModalBody) {
      settingsDropdown.append(...Array.from(settingsModalBody.children));
    }
    settingsModal?.classList.add("hidden");
    arrow?.classList.remove("rotated");
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
      settingsDropdown?.classList.contains("visible")
        ? closeDropdown()
        : openDropdown();
    });

    document.addEventListener("click", (e) => {
      if (
        !settingsToggle?.contains(e.target) &&
        !settingsDropdown?.contains(e.target)
      ) {
        closeDropdown();
      }
    });
  }

  // --------------------
  // Riddle selection + rendering
  // --------------------
  function getSelectedLanguages() {
    return Object.keys(languageCheckboxes).filter(
      (k) => languageCheckboxes[k]?.checked
    );
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
    const filtered = deck.filter((c) => c?.riddles && cardHasRiddleForUI(c));
    if (!filtered.length) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  function renderRiddle(card) {
    const r = card?.riddles;
    const langs = getSelectedLanguages();

    riddlesContainer.innerHTML = "";

    if (!langs.length) {
      riddlesContainer.innerHTML =
        "<p>Please select at least one language.</p>";
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
    const pool = deck.filter(
      (c) =>
        c?.word?.romanUrdu && c.word.romanUrdu !== correctCard?.word?.romanUrdu
    );
    shuffleArray(pool);
    return pool.slice(0, count);
  }

  // --------------------
  // Answer UI (MCQ or Hard typed)
  // --------------------
  function renderAnswerUIForCurrentCard() {
    if (!currentCard?.word) return;

    showAnswerArea(false);

    if (currentDifficulty === "Hard") {
      setStatus("Type your answer in Roman Urdu");
      renderHardModeUI();
      return;
    }

    setStatus("Tap the correct answer");
    renderMultipleChoiceUI();
  }

  function renderMultipleChoiceUI() {
    wordOptions.style.display = "grid";
    wordOptions.innerHTML = "";

    const correct = currentCard;
    const wordCount = getOptionCountForDifficulty(currentDifficulty);

    const incorrectCards = getRandomIncorrectCards(wordCount - 1, correct);
    const options = shuffleArray([correct, ...incorrectCards]);

    let locked = false;

    options.forEach((card) => {
      const romanUrdu = card.word?.romanUrdu ?? "";
      const urdu = card.word?.urdu ?? "";
      const image = card.image ?? "";

      const el = document.createElement("div");
      el.className = "word";
      el.innerHTML = `
        <p class="roman-text">${romanUrdu}</p>
        <img src="${image}" alt="${romanUrdu}" class="option-image" />
        <p class="urdu-text">${urdu}</p>
      `;

      el.addEventListener("click", () => {
        if (locked) return;

        const isCorrect = card.word?.romanUrdu === correct.word?.romanUrdu;

        if (isCorrect) {
          locked = true;
          el.classList.add("correct");

          setStatus("Nice ✅", "good");
          playSound(correctSound);
          launchConfetti();

          setTimeout(() => {
            updateRiddle();
          }, 900);
        } else {
          el.classList.add("incorrect");
          setStatus("Not that one — try again 🙂", "bad");
          playSound(incorrectSound);

          setTimeout(() => {
            el.classList.remove("incorrect");
            setStatus("Tap the correct answer");
          }, 650);
        }
      });

      wordOptions.appendChild(el);
    });
  }

  function renderHardModeUI() {
    let hintShown = false;

    wordOptions.style.display = "none";
    wordOptions.innerHTML = "";

    showAnswerArea(true);

    const correctRoman = currentCard?.word?.romanUrdu ?? "";
    const image = currentCard?.image ?? "";

    const normalizedCorrect = normalizeRomanUrdu(correctRoman);
    const threshold = getDistanceThreshold(normalizedCorrect);

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
          placeholder="Type your answer in Roman Urdu"
        />

        <div id="hard-feedback" class="hard-feedback"></div>
        <div id="hard-hint-area" class="hard-hint-area"></div>

        <div id="hard-actions" class="hard-actions">
          <button id="hard-submit-btn" class="btn" type="button">Check</button>
          <button id="hard-hint-btn" class="btn" type="button">${
            image ? "Hint" : "Reveal Answer"
          }</button>
        </div>
      </div>
    `;

    const input = document.getElementById("hard-answer-input");
    const feedback = document.getElementById("hard-feedback");
    const actions = document.getElementById("hard-actions");
    const hintArea = document.getElementById("hard-hint-area");
    const submitBtn = document.getElementById("hard-submit-btn");
    const hintBtn = document.getElementById("hard-hint-btn");

    function setHardMessage(msg) {
      if (feedback) feedback.textContent = msg || "";
    }

    function revealFinal() {
      setStatus("All good — ready for the next one?");

      answerArea.innerHTML = `
        <div style="display:grid; gap:12px; place-items:center; width:100%;">
          <div style="font-weight:900; font-size:20px; letter-spacing:0.2px; text-align:center;">
            ${correctRoman}
          </div>
          <button id="hard-next-btn" class="btn btn--primary" type="button">
            Next riddle
          </button>
        </div>
      `;

      document
        .getElementById("hard-next-btn")
        ?.addEventListener("click", () => {
          updateRiddle();
        });
    }

    function handleHintOrReveal() {
      if (!image) {
        revealFinal();
        return;
      }

      if (!hintShown) {
        hintShown = true;

        if (hintArea) {
          hintArea.innerHTML = `
            <div style="display:grid; gap:8px; place-items:center; padding-top:6px;">
              <img
                src="${image}"
                alt="hint image"
                style="
                  width:76px;
                  height:76px;
                  object-fit:contain;
                  border-radius:16px;
                  background: linear-gradient(135deg, rgba(255,224,102,0.22), rgba(40,215,183,0.16));
                  padding:10px;
                  border: 1px solid rgba(31,31,31,0.10);
                "
              />
            </div>
          `;
        }

        if (hintBtn) hintBtn.textContent = "Reveal Answer";
        setHardMessage("Here's a hint 🙂");
        setStatus("Hint unlocked 👀");
        return;
      }

      revealFinal();
    }

    function resetButtons() {
      if (!actions) return;

      actions.innerHTML = `
        <button id="hard-submit-btn" class="btn" type="button">Check</button>
        <button id="hard-hint-btn" class="btn" type="button">${
          image ? (hintShown ? "Reveal Answer" : "Hint") : "Reveal Answer"
        }</button>
      `;

      document
        .getElementById("hard-submit-btn")
        ?.addEventListener("click", handleSubmit);

      document
        .getElementById("hard-hint-btn")
        ?.addEventListener("click", handleHintOrReveal);
    }

    function showSuggestionFlow() {
      if (!actions) return;

      actions.innerHTML = `
        <button id="hard-yes-btn" class="btn btn--primary" type="button">Yes</button>
        <button id="hard-tryagain-btn" class="btn" type="button">Try again</button>
        <button id="hard-hint-btn" class="btn" type="button">${
          image ? (hintShown ? "Reveal Answer" : "Hint") : "Reveal Answer"
        }</button>
      `;

      document.getElementById("hard-yes-btn")?.addEventListener("click", () => {
        setHardMessage("Nice ✅");
        setStatus("Nice ✅", "good");
        playSound(correctSound);
        launchConfetti();
        setTimeout(() => updateRiddle(), 900);
      });

      document
        .getElementById("hard-tryagain-btn")
        ?.addEventListener("click", () => {
          setHardMessage("No worries — try once more 🙂");
          setStatus("Type your answer in Roman Urdu");
          resetButtons();
          input?.focus();
          input?.select();
        });

      document
        .getElementById("hard-hint-btn")
        ?.addEventListener("click", handleHintOrReveal);
    }

    function handleSubmit() {
      const typed = input?.value ?? "";
      const normalizedTyped = normalizeRomanUrdu(typed);

      if (!normalizedTyped) {
        setHardMessage("Type a Roman Urdu answer above 🙂");
        setStatus("Type an answer above 🙂", "bad");
        input?.focus();
        return;
      }

      if (normalizedTyped === normalizedCorrect) {
        setHardMessage("Nice ✅");
        setStatus("Nice ✅", "good");
        playSound(correctSound);
        launchConfetti();
        setTimeout(() => updateRiddle(), 900);
        return;
      }

      const dist = levenshtein(normalizedTyped, normalizedCorrect);

      if (dist <= threshold) {
        setHardMessage(`Did you mean: ${correctRoman}?`);
        setStatus("Close! Confirm below 👇");
        showSuggestionFlow();
        return;
      }

      setHardMessage("Almost — take another guess 🙂");
      setStatus("Almost — try again 🙂", "bad");
      playSound(incorrectSound);
      input?.focus();
      input?.select();
    }

    submitBtn?.addEventListener("click", handleSubmit);
    hintBtn?.addEventListener("click", handleHintOrReveal);

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    });

    setTimeout(() => input?.focus(), 0);
  }

  // --------------------
  // Update riddle (selects a new one)
  // --------------------
  function updateRiddle() {
    const langs = getSelectedLanguages();
    if (!langs.length) {
      riddlesContainer.innerHTML =
        "<p>Please select at least one language.</p>";
      wordOptions.innerHTML = "";
      wordOptions.style.display = "none";
      showAnswerArea(false);
      setStatus("Select at least one language", "bad");
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
      riddlesContainer.innerHTML =
        "<p>No riddles found in this deck for the selected languages.</p>";
      wordOptions.innerHTML = "";
      wordOptions.style.display = "none";
      showAnswerArea(false);
      setStatus("No riddles available", "bad");
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

    // Difficulty change does NOT change the riddle; only answer UI.
    renderAnswerUIForCurrentCard();
  }

  if (difficultyRange) {
    setDifficultyFromSlider(difficultyRange.value);
    difficultyRange.addEventListener("input", (e) => {
      setDifficultyFromSlider(e.target.value);
    });
  }

  Object.values(languageCheckboxes).forEach((cb) => {
    cb.addEventListener("change", () => {
      updateRiddle();
    });
  });

  // Start game
  updateRiddle();
});