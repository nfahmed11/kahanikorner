// ✅ Import vocab
import { vocab as originalVocab } from "./vocab.js";

document.addEventListener("DOMContentLoaded", () => {
  // Read window.ALLOWED_WORDS here, not at module load time
  const ALLOWED_WORDS = window.ALLOWED_WORDS;

  const PASTEL_FRONTS = [
    "#FFDEE9", // pink
    "#DFF7E3", // mint
    "#DDEBFF", // baby blue
    "#FFF2CC", // butter
    "#EBD9FF", // lavender
    "#FFD9E8", // rose
    "#D9FFF7", // aqua
    "#FDE2D4", // peach
    "#E2F0CB", // light green
    "#C7CEEA", // periwinkle
  ];

  // deterministic per-card color (so it stays consistent)
  function getFrontColor(pairIndex, type) {
    const offset = type === "english" ? 0 : 1;
    return PASTEL_FRONTS[(pairIndex * 2 + offset) % PASTEL_FRONTS.length];
  }

  const gameBoard = document.getElementById("game-board");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const winMessage = document.getElementById("win-message");
  const playAgainBtn = document.getElementById("play-again");
  const difficultySlider = document.getElementById("difficulty-slider");
  const difficultyLabel = document.getElementById("difficulty-label");

  const cardFlipSound = new Audio("/qr/assets/audio/cardflip.mp3");
  cardFlipSound.preload = "auto";
  const correctSound = new Audio("/qr/assets/audio/success.wav");
  correctSound.preload = "auto";

  const btn = document.getElementById("settings-btn");
  const pop = document.getElementById("settings-popover");
  const close = document.getElementById("settings-close");
  const done = document.getElementById("settings-done");

  function openPop() {
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }
  function closePop() {
    pop.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  }

  btn?.addEventListener("click", () => {
    const isOpen = !pop.classList.contains("hidden");
    isOpen ? closePop() : openPop();
  });

  close?.addEventListener("click", closePop);
  done?.addEventListener("click", closePop);

  document.addEventListener("click", (e) => {
    if (!pop || pop.classList.contains("hidden")) return;
    const target = e.target;
    if (target === btn || pop.contains(target)) return;
    closePop();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop && !pop.classList.contains("hidden")) {
      closePop();
    }
  });

  // ✅ Safety checks
  if (!(ALLOWED_WORDS instanceof Set)) {
    console.error(
      "[memory-game] window.ALLOWED_WORDS is missing or not a Set. " +
        "Make sure the ?words= param is in the URL and the HTML script block runs before memory.js"
    );
  }

  if (!Array.isArray(originalVocab)) {
    console.error(
      "[memory-game] originalVocab is NOT an array. Import/path issue?",
      originalVocab
    );
  }

  function getRomanForms(card) {
    const v = card?.word?.romanUrdu;
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  function matchesAllowed(card) {
    const forms = getRomanForms(card);
    return forms.some((w) => ALLOWED_WORDS.has(w));
  }

  function displayRoman(card) {
    const forms = getRomanForms(card);
    const matched = forms.find((w) => ALLOWED_WORDS.has(w));
    return matched || forms[0] || "";
  }

  // ✅ Filter vocab using ALLOWED_WORDS
  const safeVocab = Array.isArray(originalVocab) ? originalVocab : [];
  const vocabWords = new Set(safeVocab.flatMap((c) => getRomanForms(c)));
  const filteredVocab = safeVocab.filter(matchesAllowed);

  // ----------------------------
  // 🔥 DEBUG LOGGING (on load)
  // ----------------------------
  console.log("========== MEMORY DEBUG ==========");
  console.log("[memory-game] Total ALLOWED_WORDS:", ALLOWED_WORDS?.size ?? 0);
  console.log("[memory-game] ALLOWED_WORDS:", [...ALLOWED_WORDS]);
  console.log("[memory-game] Total vocab roman forms available:", vocabWords.size);

  const loaded = filteredVocab.map((c) => displayRoman(c));
  console.log("[memory-game] Total words loaded into deck:", filteredVocab.length);
  console.log("[memory-game] Loaded words:", loaded);

  const missingWords = [...ALLOWED_WORDS].filter((w) => !vocabWords.has(w));
  if (missingWords.length) {
    console.warn("[memory-game] ❌ Words NOT found in vocab.js:", missingWords);
  } else {
    console.log("[memory-game] ✅ All ALLOWED_WORDS found in vocab.js");
  }
  console.log("==================================");

  // Prepare vocabularyPairs from filtered vocab
  const vocabularyPairs = filteredVocab.map((item) => ({
    english: { word: item.word.english, image: item.image },
    urdu: { romanUrdu: displayRoman(item), urduWord: item.word.urdu },
  }));

  function shrinkTextToFit(el, { minPx = 10, stepPx = 1 } = {}) {
    if (!el) return;
    const style = window.getComputedStyle(el);
    let size = parseFloat(style.fontSize);
    if (!Number.isFinite(size)) return;
    while (
      size > minPx &&
      (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
    ) {
      size -= stepPx;
      el.style.fontSize = `${size}px`;
    }
  }

  let cards = [];
  let flippedCards = [];
  let matchedPairs = 0;
  let canFlip = true;
  let difficultyLevel = 5;
  let currentPairs = [];

  if (difficultySlider) {
    difficultyLevel = Number(difficultySlider.value || 5);
    if (difficultyLabel)
      difficultyLabel.textContent = `Level ${difficultyLevel}`;

    difficultySlider.addEventListener("input", () => {
      difficultyLevel = Number(difficultySlider.value);
      if (difficultyLabel)
        difficultyLabel.textContent = `Level ${difficultyLevel}`;
      initGame();
    });
  }

  function initGame() {
    gameBoard.innerHTML = "";
    cards = [];
    flippedCards = [];
    matchedPairs = 0;
    canFlip = true;
    winMessage.classList.add("hidden");

    const total = vocabularyPairs.length;
    const ratio = difficultyLevel / 10;
    const count = Math.min(total, Math.max(1, Math.ceil(total * ratio)));

    currentPairs = vocabularyPairs.slice(0, count);

    progressBar.style.width = "0%";
    progressText.textContent = `0/${currentPairs.length} Pairs`;

    currentPairs.forEach((pair, index) => {
      const englishCard = createCard(
        pair.english.word,
        pair.english.image,
        "english",
        index
      );
      cards.push(englishCard);

      const urduCard = createCard(
        pair.urdu.romanUrdu,
        pair.urdu.urduWord,
        "urdu",
        index
      );
      cards.push(urduCard);
    });

    shuffleArray(cards);
    cards.forEach((card) => gameBoard.appendChild(card));

    requestAnimationFrame(() => {
      document
        .querySelectorAll(".fit-text")
        .forEach((el) => shrinkTextToFit(el, { minPx: 10 }));
      document
        .querySelectorAll(".fit-text-urdu")
        .forEach((el) => shrinkTextToFit(el, { minPx: 12 }));
    });
  }

  function createCard(primaryText, secondaryText, type, pairIndex) {
    const card = document.createElement("div");
    card.className = "card aspect-square";
    card.dataset.pairIndex = pairIndex;
    card.dataset.type = type;

    const frontBg = getFrontColor(pairIndex, type);

    card.innerHTML = `
  <div class="card-inner w-full h-full">
    <div
      class="card-front flex items-center justify-center"
      style="background: ${frontBg};"
    >
      <span class="text-3xl font-bold text-gray-800">?</span>
    </div>

    <div class="card-back ${
      type === "english" ? "english-card" : "urdu-card"
    } p-3 flex flex-col items-center justify-center text-center">
      ${
        type === "english"
          ? `
          <div class="card-image-box">
            <img src="${secondaryText}" alt="${primaryText}" />
          </div>
          <div class="w-full h-10 flex items-center justify-center">
            <span class="font-bold text-gray-800 fit-text">
              ${primaryText}
            </span>
          </div>
          `
          : `
          <div class="w-full h-8 flex items-center justify-center">
            <span class="font-bold fit-text">
              ${primaryText}
            </span>
          </div>
          <div class="w-full h-12 flex items-center justify-center">
            <span class="fit-text-urdu">
              ${secondaryText}
            </span>
          </div>
          `
      }
    </div>
  </div>
`;

    card.addEventListener("click", () => flipCard(card));
    return card;
  }

  function flipCard(card) {
    if (
      !canFlip ||
      card.classList.contains("flipped") ||
      flippedCards.includes(card)
    ) {
      return;
    }

    try {
      cardFlipSound.currentTime = 0;
      cardFlipSound.play();
    } catch {}

    card.classList.add("flipped");
    flippedCards.push(card);

    if (flippedCards.length === 2) {
      canFlip = false;
      checkForMatch();
    }
  }

  function checkForMatch() {
    const [card1, card2] = flippedCards;
    const isMatch =
      card1.dataset.pairIndex === card2.dataset.pairIndex &&
      card1.dataset.type !== card2.dataset.type;

    if (isMatch) {
      setTimeout(() => {
        try {
          correctSound.currentTime = 0;
          correctSound.play();
        } catch {}

        card1.classList.add("match-animation");
        card2.classList.add("match-animation");
        createConfetti(card1);
        createConfetti(card2);

        matchedPairs++;
        updateProgress();

        flippedCards = [];
        canFlip = true;

        if (matchedPairs === currentPairs.length) {
          setTimeout(() => showWinMessage(), 1000);
        }
      }, 500);
    } else {
      setTimeout(() => {
        card1.classList.remove("flipped");
        card2.classList.remove("flipped");
        flippedCards = [];
        canFlip = true;
      }, 1000);
    }
  }

  function updateProgress() {
    const progressPercentage = (matchedPairs / currentPairs.length) * 100;
    progressBar.style.width = `${progressPercentage}%`;
    progressText.textContent = `${matchedPairs}/${currentPairs.length} Pairs`;
  }

  function showWinMessage() {
    winMessage.classList.remove("hidden");
    createWinConfetti();
  }

  function createConfetti(card) {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const colors = ["#FF9AA2", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#B5EAD7", "#C7CEEA"];

    for (let i = 0; i < 20; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = `${centerX}px`;
      confetti.style.top = `${centerY}px`;
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.style.width = `${5 + Math.random() * 10}px`;
      confetti.style.height = `${5 + Math.random() * 10}px`;
      confetti.style.animationDelay = `${Math.random() * 0.5}s`;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 3000);
    }
  }

  function createWinConfetti() {
    const colors = ["#FF9AA2", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#B5EAD7", "#C7CEEA"];

    for (let i = 0; i < 100; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = `${Math.random() * window.innerWidth}px`;
      confetti.style.top = "0px";
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.style.width = `${5 + Math.random() * 10}px`;
      confetti.style.height = `${5 + Math.random() * 10}px`;
      confetti.style.animationDelay = `${Math.random() * 2}s`;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 5000);
    }
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  playAgainBtn.addEventListener("click", initGame);
  initGame();
});