// ✅ Import vocab
import { vocab as originalVocab } from "./vocab.js";

document.addEventListener("DOMContentLoaded", async () => {
  const ALLOWED_WORDS = window.ALLOWED_WORDS;

  const PASTEL_FRONTS = [
    "#FFDEE9",
    "#DFF7E3",
    "#DDEBFF",
    "#FFF2CC",
    "#EBD9FF",
    "#FFD9E8",
    "#D9FFF7",
    "#FDE2D4",
    "#E2F0CB",
    "#C7CEEA",
  ];

  const LEVEL_CONFIG = {
    1: { pairs: 6, useImages: true },
    2: { pairs: 10, useImages: true },
    3: { pairs: 14, useImages: true },
    4: { pairs: 18, useImages: false },
    5: { pairs: 22, useImages: false },
  };

  const DEFAULT_LEVEL = 3;
  const MIN_LEVEL = 1;
  const MAX_LEVEL = 5;

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
    if (!pop || !btn) return;
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }

  function closePop() {
    if (!pop || !btn) return;
    pop.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  }

  btn?.addEventListener("click", () => {
    const isOpen = !pop?.classList.contains("hidden");
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

  // --------------------
  // Safety checks
  // --------------------
  if (!(ALLOWED_WORDS instanceof Set)) {
    console.error(
      "[memory-game] window.ALLOWED_WORDS is missing or not a Set. " +
        "Make sure the ?words= param is in the URL and the HTML script block runs before memory.js",
    );
  }

  if (!Array.isArray(originalVocab)) {
    console.error(
      "[memory-game] originalVocab is NOT an array. Import/path issue?",
      originalVocab,
    );
  }

  if (
    !gameBoard ||
    !progressBar ||
    !progressText ||
    !winMessage ||
    !playAgainBtn
  ) {
    console.error("[memory-game] Missing required DOM elements.");
    return;
  }

  // --------------------
  // Helpers for NEW vocab schema
  // --------------------
  function getRomanForms(card) {
    if (!card) return [];

    const forms = [];

    if (card.word?.baseRomanUrdu) {
      forms.push(card.word.baseRomanUrdu);
    }

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

  function matchesAllowed(card) {
    if (!(ALLOWED_WORDS instanceof Set)) return false;
    const forms = getRomanForms(card);
    return forms.some((w) => ALLOWED_WORDS.has(w));
  }

  function displayRoman(card) {
    const forms = getRomanForms(card);
    const matched = forms.find((w) => ALLOWED_WORDS?.has(w));
    return matched || getBaseRoman(card) || "";
  }

  function hasImagePath(card) {
    return !!(card?.image && typeof card.image === "string");
  }

  function imageLoads(src) {
    return new Promise((resolve) => {
      if (!src) {
        resolve(false);
        return;
      }

      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  function shuffleArray(array) {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
  }

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

  // --------------------
  // Build filtered vocab pools
  // --------------------
  const safeVocab = Array.isArray(originalVocab) ? originalVocab : [];
  const vocabWords = new Set(safeVocab.flatMap((c) => getRomanForms(c)));
  const allowedVocab = safeVocab.filter(matchesAllowed);

  const imageCheckResults = await Promise.all(
    allowedVocab.map(async (card) => ({
      card,
      ok: hasImagePath(card) && (await imageLoads(card.image)),
    })),
  );

  const imageReadyVocab = imageCheckResults
    .filter((result) => result.ok)
    .map((result) => result.card);

  const skippedBrokenImageWords = imageCheckResults
    .filter((result) => !result.ok)
    .map((result) => displayRoman(result.card));

  const missingWords =
    ALLOWED_WORDS instanceof Set
      ? [...ALLOWED_WORDS].filter((w) => !vocabWords.has(w))
      : [];

  console.group("[memory-game] vocab summary");
  console.log(
    "Allowed words requested:",
    ALLOWED_WORDS ? [...ALLOWED_WORDS] : [],
  );
  console.log("Allowed vocab count:", allowedVocab.length);
  console.log("Image-ready vocab count:", imageReadyVocab.length);
  if (missingWords.length) {
    console.warn("Words not found in vocab.js:", missingWords);
  }
  if (skippedBrokenImageWords.length) {
    console.warn(
      "Words skipped due to missing/broken images:",
      skippedBrokenImageWords,
    );
  }
  console.groupEnd();

  let cards = [];
  let flippedCards = [];
  let matchedPairs = 0;
  let canFlip = true;
  let difficultyLevel = DEFAULT_LEVEL;
  let currentPairs = [];

  if (difficultySlider) {
    difficultySlider.min = String(MIN_LEVEL);
    difficultySlider.max = String(MAX_LEVEL);
    difficultySlider.step = "1";
    difficultySlider.value = String(DEFAULT_LEVEL);

    difficultyLevel = DEFAULT_LEVEL;

    if (difficultyLabel) {
      difficultyLabel.textContent = `Level ${difficultyLevel}`;
    }

    difficultySlider.addEventListener("input", () => {
      const sliderValue = Number(difficultySlider.value);
      difficultyLevel = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, sliderValue));

      if (difficultyLabel) {
        difficultyLabel.textContent = `Level ${difficultyLevel}`;
      }

      initGame();
    });
  }

  function buildVocabularyPairs(sourceVocab, useImages) {
    return sourceVocab.map((item) => ({
      english: {
        word: getEnglish(item),
        image: useImages ? item.image : null,
      },
      urdu: {
        romanUrdu: displayRoman(item),
        urduWord: getUrdu(item),
      },
    }));
  }

  function createCard(primaryText, secondaryText, type, pairIndex, useImages) {
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
              ? useImages
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
                  <div class="w-full h-full flex items-center justify-center">
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

  function initGame() {
    gameBoard.innerHTML = "";
    cards = [];
    flippedCards = [];
    matchedPairs = 0;
    canFlip = true;
    currentPairs = [];
    winMessage.classList.add("hidden");
    progressBar.style.width = "0%";

    const levelSettings = LEVEL_CONFIG[difficultyLevel] || LEVEL_CONFIG[DEFAULT_LEVEL];
    const { pairs: requestedPairs, useImages } = levelSettings;

    const sourcePool = useImages ? imageReadyVocab : allowedVocab;
    const shuffledPool = shuffleArray(sourcePool);
    const actualPairCount = Math.min(requestedPairs, shuffledPool.length);

    if (!sourcePool.length || actualPairCount === 0) {
      gameBoard.innerHTML = `
        <div class="text-center p-4">
          ${
            useImages
              ? "No image-backed words available for this level."
              : "No words loaded for this level."
          }
        </div>
      `;
      progressText.textContent = "0/0 Pairs";
      console.warn(
        `[memory-game] Level ${difficultyLevel}: no usable words available.`,
      );
      return;
    }

    if (actualPairCount < requestedPairs) {
      console.warn(
        `[memory-game] Level ${difficultyLevel}: requested ${requestedPairs} pairs but only ${actualPairCount} usable pairs were available.`,
      );
    }

    currentPairs = buildVocabularyPairs(
      shuffledPool.slice(0, actualPairCount),
      useImages,
    );

    progressText.textContent = `0/${currentPairs.length} Pairs`;

    currentPairs.forEach((pair, index) => {
      const englishCard = createCard(
        pair.english.word,
        pair.english.image,
        "english",
        index,
        useImages,
      );
      cards.push(englishCard);

      const urduCard = createCard(
        pair.urdu.romanUrdu,
        pair.urdu.urduWord,
        "urdu",
        index,
        useImages,
      );
      cards.push(urduCard);
    });

    const shuffledCards = shuffleArray(cards);
    shuffledCards.forEach((card) => gameBoard.appendChild(card));

    console.group(`[memory-game] Level ${difficultyLevel}`);
    console.log("Mode:", useImages ? "images" : "text-only");
    console.log("Requested pairs:", requestedPairs);
    console.log("Actual pairs used:", actualPairCount);
    console.log(
      "Words used:",
      currentPairs.map((pair) => pair.urdu.romanUrdu),
    );
    console.groupEnd();

    requestAnimationFrame(() => {
      document
        .querySelectorAll(".fit-text")
        .forEach((el) => shrinkTextToFit(el, { minPx: 10 }));

      document
        .querySelectorAll(".fit-text-urdu")
        .forEach((el) => shrinkTextToFit(el, { minPx: 12 }));
    });
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
      cardFlipSound.play().catch(() => {});
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
          correctSound.play().catch(() => {});
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
    const progressPercentage =
      currentPairs.length > 0 ? (matchedPairs / currentPairs.length) * 100 : 0;
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
    const colors = [
      "#FF9AA2",
      "#FFB7B2",
      "#FFDAC1",
      "#E2F0CB",
      "#B5EAD7",
      "#C7CEEA",
    ];

    for (let i = 0; i < 20; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = `${centerX}px`;
      confetti.style.top = `${centerY}px`;
      confetti.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.style.width = `${5 + Math.random() * 10}px`;
      confetti.style.height = `${5 + Math.random() * 10}px`;
      confetti.style.animationDelay = `${Math.random() * 0.5}s`;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 3000);
    }
  }

  function createWinConfetti() {
    const colors = [
      "#FF9AA2",
      "#FFB7B2",
      "#FFDAC1",
      "#E2F0CB",
      "#B5EAD7",
      "#C7CEEA",
    ];

    for (let i = 0; i < 100; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = `${Math.random() * window.innerWidth}px`;
      confetti.style.top = "0px";
      confetti.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.style.width = `${5 + Math.random() * 10}px`;
      confetti.style.height = `${5 + Math.random() * 10}px`;
      confetti.style.animationDelay = `${Math.random() * 2}s`;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 5000);
    }
  }

  playAgainBtn.addEventListener("click", initGame);
  initGame();
});