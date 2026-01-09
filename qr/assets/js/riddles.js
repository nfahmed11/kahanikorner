console.log("[riddle] script loaded");

// ✅ grab allowed words from HTML
const ALLOWED_WORDS = window.ALLOWED_WORDS;

if (!(ALLOWED_WORDS instanceof Set)) {
  console.error(
    "[riddle] window.ALLOWED_WORDS is missing or not a Set. " +
      "Make sure you set window.ALLOWED_WORDS in HTML BEFORE loading riddle.js"
  );
}

// ✅ import your BIG vocab file (tons of words)
import { vocab as originalVocab } from "./vocab.js";

console.log(
  "[riddle] vocab loaded?",
  Array.isArray(originalVocab),
  originalVocab?.length
);

let deck = [];

function resetDeck() {
  if (!Array.isArray(originalVocab)) {
    console.error(
      "[riddle] vocab import failed or not an array",
      originalVocab
    );
    deck = [];
    return;
  }

  if (!(ALLOWED_WORDS instanceof Set)) {
    deck = [];
    return;
  }

  // ✅ Filter big vocab down to allowed subset
  deck = originalVocab.filter((card) =>
    ALLOWED_WORDS.has(card.word?.romanUrdu)
  );

  console.log("[riddle] deck rebuilt", {
    deckLength: deck.length,
    words: deck.map((c) => c.word?.romanUrdu),
  });

  if (deck.length === 0) {
    console.warn("[riddle] deck empty after filtering.");
    console.warn(
      "[riddle] sample romanUrdu in vocab:",
      originalVocab.slice(0, 20).map((v) => v.word?.romanUrdu)
    );
  }
}

// ✅ ROOT audio paths (as requested)
const correctSound = new Audio("/qr/assets/audio/success.wav");
const incorrectSound = new Audio("/qr/assets/audio/incorrect.wav");
// swap incorrectSound to a different file if you have it

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

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

document.addEventListener("DOMContentLoaded", () => {
  const settingsContainer = document.getElementById("settings-container");
  const settingsDropdown = document.getElementById("settings-dropdown");
  const settingsToggle = document.getElementById("settings-toggle");
  const arrow = document.getElementById("settings-arrow");

  const selectedDifficulty = document.getElementById("selected-difficulty");
  const difficultyRadios = document.querySelectorAll(
    "input[name='difficulty']"
  );

  const riddlesContainer = document.getElementById("riddle-container");
  const dropZone = document.getElementById("drop-zone");
  const wordOptions = document.getElementById("word-options");

  const languageCheckboxes = {
    romanUrdu: document.getElementById("romanUrdu"),
    urdu: document.getElementById("urdu"),
    english: document.getElementById("english"),
  };

  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  resetDeck();

  if (!deck.length) {
    dropZone.textContent = "No words loaded (deck is empty)";
    return;
  }

  // --- Settings behavior: desktop dropdown + mobile modal ---

  const settingsModal = document.getElementById("settings-modal");
  const settingsModalBody = document.getElementById("settings-modal-body");
  const settingsModalBackdrop = document.getElementById(
    "settings-modal-backdrop"
  );
  const settingsModalClose = document.getElementById("settings-modal-close");
  const settingsModalDone = document.getElementById("settings-modal-done");

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
    // move dropdown contents into modal
    if (settingsDropdown && settingsModalBody) {
      settingsModalBody.append(...Array.from(settingsDropdown.children));
    }

    settingsModal?.classList.remove("hidden");
    arrow?.classList.add("rotated");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    // move contents back into dropdown
    if (settingsDropdown && settingsModalBody) {
      settingsDropdown.append(...Array.from(settingsModalBody.children));
    }

    settingsModal?.classList.add("hidden");
    arrow?.classList.remove("rotated");
    document.body.style.overflow = "";
  }

  if (isTouchDevice) {
    // 📱 MOBILE → MODAL
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
    // 🖥️ DESKTOP → DROPDOWN
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

  let currentDifficulty = "Easy";
  let currentCard = null;

  function getDifficultyKey() {
    return currentDifficulty.toLowerCase(); // "easy" | "medium" | "hard"
  }

  function getSelectedLanguages() {
    return Object.keys(languageCheckboxes).filter(
      (k) => languageCheckboxes[k]?.checked
    );
  }

  // ✅ choose a random vocab card that has riddles for the current difficulty
  function getRandomCard() {
    const key = getDifficultyKey();

    const filtered = deck.filter((c) => {
      const r = c?.riddles?.[key];
      return r && (r.romanUrdu || r.urdu || r.english);
    });

    if (!filtered.length) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  function renderRiddle(card) {
    const key = getDifficultyKey();
    const riddleTexts = card?.riddles?.[key];

    riddlesContainer.innerHTML = "";
    const langs = getSelectedLanguages();

    if (!langs.length) {
      riddlesContainer.innerHTML =
        "<p>Please select at least one language.</p>";
      return false;
    }

    const row = document.createElement("div");
    row.className = "riddle-row";

    const box = document.createElement("div");
    box.className = "riddle-box";

    if (languageCheckboxes.romanUrdu.checked && riddleTexts?.romanUrdu) {
      const p = document.createElement("p");
      p.className = "roman-text";
      p.textContent = riddleTexts.romanUrdu;
      box.appendChild(p);
    }

    if (languageCheckboxes.urdu.checked && riddleTexts?.urdu) {
      const p = document.createElement("p");
      p.className = "urdu-text";
      p.textContent = riddleTexts.urdu;
      box.appendChild(p);
    }

    if (languageCheckboxes.english.checked && riddleTexts?.english) {
      const p = document.createElement("p");
      p.className = "english-text";
      p.textContent = riddleTexts.english;
      box.appendChild(p);
    }

    row.appendChild(box);
    riddlesContainer.appendChild(row);
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

  function generateWordOptions() {
    if (!currentCard?.word) return;

    wordOptions.innerHTML = "";
    dropZone.classList.remove("correct", "incorrect");
    dropZone.textContent = "Select An Answer";

    const wordCount =
      currentDifficulty === "Easy"
        ? 3
        : currentDifficulty === "Medium"
        ? 5
        : 10;

    const correct = currentCard;

    const incorrectCards = getRandomIncorrectCards(wordCount - 1, correct);

    const options = shuffleArray([correct, ...incorrectCards]);

    options.forEach((card) => {
      const romanUrdu = card.word?.romanUrdu ?? "";
      const urdu = card.word?.urdu ?? "";
      const image = card.image ?? ""; // ✅ should already be root-style in vocab

      const el = document.createElement("div");
      el.className = "word";
      el.innerHTML = `
        <p class="roman-text">${romanUrdu}</p>
        <img src="${image}" alt="${romanUrdu}" class="option-image" />
        <p class="urdu-text">${urdu}</p>
      `;

      el.addEventListener("click", () => {
        const isCorrect = card.word?.romanUrdu === correct.word?.romanUrdu;

        if (isCorrect) {
          dropZone.classList.add("correct");
          dropZone.innerHTML = `
            <div class="roman">${romanUrdu}</div>
            <img src="${image}" alt="${romanUrdu}" class="dropzone-image" />
            <div class="urdu">${urdu}</div>
          `;

          playSound(correctSound);
          launchConfetti();

          setTimeout(() => {
            // clear first so you never see stale riddle lingering
            riddlesContainer.innerHTML = "";
            updateRiddle();
          }, 1400);
        } else {
          dropZone.classList.add("incorrect");
          dropZone.textContent = "Try Again!";
          el.classList.add("incorrect");
          playSound(incorrectSound);

          setTimeout(() => {
            dropZone.classList.remove("incorrect");
            el.classList.remove("incorrect");
          }, 450);
        }
      });

      wordOptions.appendChild(el);
    });
  }

  function cardHasRiddleForUI(card) {
    const key = getDifficultyKey();
    const r = card?.riddles?.[key];
    if (!r) return false;

    // must have text in at least one *selected* language
    if (languageCheckboxes.romanUrdu.checked && r.romanUrdu) return true;
    if (languageCheckboxes.urdu.checked && r.urdu) return true;
    if (languageCheckboxes.english.checked && r.english) return true;

    return false;
  }

  function updateRiddle() {
    // if user unchecks all languages, renderRiddle will show message
    const langs = getSelectedLanguages();
    if (!langs.length) {
      riddlesContainer.innerHTML =
        "<p>Please select at least one language.</p>";
      wordOptions.innerHTML = "";
      dropZone.textContent = "Select An Answer";
      return;
    }

    // Try multiple times to find a card that can render for this UI state
    const MAX_TRIES = 40;

    let next = null;
    for (let i = 0; i < MAX_TRIES; i++) {
      const candidate = getRandomCard(); // already filters by difficulty presence
      if (candidate && cardHasRiddleForUI(candidate)) {
        next = candidate;
        break;
      }
    }

    if (!next) {
      riddlesContainer.innerHTML =
        "<p>No riddles found in this deck for the selected difficulty/languages.</p>";
      wordOptions.innerHTML = "";
      dropZone.textContent = "No riddles available";
      return;
    }

    currentCard = next;

    // Always re-render riddle + options together
    renderRiddle(currentCard);
    generateWordOptions();
  }

  // --- Listeners ---
  difficultyRadios.forEach((r) => {
    r.addEventListener("change", (e) => {
      currentDifficulty = e.target.value;
      if (selectedDifficulty) updateRiddle();
      if (isTouchDevice) closeSettings();
    });
  });

  Object.values(languageCheckboxes).forEach((cb) => {
    cb.addEventListener("change", () => {
      updateRiddle();
      if (isTouchDevice) closeSettings();
    });
  });

  updateRiddle();
});
