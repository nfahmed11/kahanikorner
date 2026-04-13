import { vocab as originalVocab } from "./vocab.js";

// --------------------
// Card border colors (cycles per card)
// --------------------
export const CARD_COLORS = [
  "#f0c75e", // golden yellow
  "#6ab97b", // soft green
  "#e8836b", // coral
  "#6bb5d9", // sky blue
  "#b088d0", // lavender
  "#f0975e", // warm orange
  "#5bbfb5", // teal
  "#e87ba0", // rose pink
];

// --------------------
// Audio (lazy — created once, shared)
// --------------------
export const audio = {
  sparkle: new Audio("/qr/assets/audio/sparkle.mp3"),
  correct: new Audio("/qr/assets/audio/success.wav"),
  incorrect: new Audio("/qr/assets/audio/incorrect.wav"),
  cardFlip: new Audio("/qr/assets/audio/cardflip.mp3"),
};

// --------------------
// Vocab helpers
// --------------------
export function getImageSrc(card) {
  return card?.image || "/qr/assets/images/noimage.png";
}

export function getRomanForms(card) {
  if (!card) return [];
  const forms = [];
  if (card.word?.baseRomanUrdu) forms.push(card.word.baseRomanUrdu);
  if (Array.isArray(card.variants)) {
    card.variants.forEach((v) => {
      if (v?.romanUrdu) forms.push(v.romanUrdu);
    });
  }
  return [...new Set(forms)];
}

export function getUrdu(card) {
  return card?.word?.baseUrdu || "";
}

export function getEnglish(card) {
  return card?.word?.english || "";
}

export function displayRoman(card) {
  const forms = getRomanForms(card);
  const matched = forms.find((w) => ALLOWED_WORDS.has(w));
  return matched || card?.word?.baseRomanUrdu || "";
}

// --------------------
// Deck builder
// --------------------
export function buildDeck({ shuffle = false } = {}) {
  if (!Array.isArray(originalVocab)) {
    console.error("[deck] vocab import failed:", originalVocab);
    return [];
  }

  const vocabWords = new Set(originalVocab.flatMap((c) => getRomanForms(c)));
  const missingWords = [...ALLOWED_WORDS].filter((w) => !vocabWords.has(w));

  const matchesAllowed = (card) =>
    getRomanForms(card).some((w) => ALLOWED_WORDS.has(w));

  const deck = originalVocab.filter(matchesAllowed);

  console.log("========== DECK DEBUG ==========");
  console.log("[deck] ALLOWED_WORDS:", ALLOWED_WORDS?.size ?? 0, [...ALLOWED_WORDS]);
  console.log("[deck] Loaded:", deck.length, deck.map((c) => displayRoman(c)));
  if (missingWords.length) {
    console.warn("[deck] Missing from vocab.js:", missingWords);
  }
  console.log("================================");

  if (shuffle) deck.sort(() => Math.random() - 0.5);
  return deck;
}

// --------------------
// Card color
// --------------------
export function getCardColor(index) {
  return CARD_COLORS[index % CARD_COLORS.length];
}

// --------------------
// Effects
// --------------------
export function createSparkle(x, y) {
  const sparkle = document.createElement("div");
  sparkle.classList.add("sparkle");
  sparkle.style.left = `${x}px`;
  sparkle.style.top = `${y}px`;
  document.body.appendChild(sparkle);
  setTimeout(() => sparkle.remove(), 1000);
}

export function triggerSparkles(centerX, centerY) {
  audio.sparkle.currentTime = 0;
  audio.sparkle.play().catch(() => {});
  for (let i = 0; i < 10; i++) {
    createSparkle(
      centerX + (Math.random() * 60 - 30),
      centerY + (Math.random() * 30 - 15),
    );
  }
}

export function launchConfetti() {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "9999",
  });
  for (let i = 0; i < 30; i++) {
    const piece = document.createElement("div");
    Object.assign(piece.style, {
      position: "absolute",
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      background: `hsl(${Math.random() * 360}, 100%, 70%)`,
      top: "0",
      left: `${Math.random() * 100}%`,
      animation: `fall ${2 + Math.random() * 2}s ease-out`,
    });
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 4000);
}

// --------------------
// Menu helpers
// --------------------
export function setupMenu(toggleEl, dropdownEl) {
  let open = false;

  function openMenu() {
    open = true;
    dropdownEl.classList.remove("hidden");
    const backdrop = document.createElement("div");
    backdrop.classList.add("menu-backdrop");
    backdrop.addEventListener("click", closeMenu);
    document.body.appendChild(backdrop);
  }

  function closeMenu() {
    open = false;
    dropdownEl.classList.add("hidden");
    document.querySelectorAll(".menu-backdrop").forEach((el) => el.remove());
  }

  toggleEl.addEventListener("click", (e) => {
    e.stopPropagation();
    open ? closeMenu() : openMenu();
  });

  return { closeMenu };
}

// --------------------
// Hint helpers
// --------------------
export function renderHintBlock(card, { showImage = false } = {}) {
  if (showImage) {
    return `
      <div class="hint-wrapper flex flex-col items-center">
        <img src="${getImageSrc(card)}"
             onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';"
             alt="Word Image" class="w-16 h-16 object-contain" />
      </div>`;
  }

  return `
    <button id="hint-btn" class="hint-wrapper flex flex-col items-center gap-1" style="background:none;border:none;cursor:pointer;">
      <div class="relative" style="width:72px;height:72px;">
        <img class="filler-image w-full h-full object-contain absolute top-0 left-0"
             src="https://cdn-icons-png.flaticon.com/512/427/427735.png" alt="Hint Icon" />
        <img class="hint-image w-full h-full object-contain absolute top-0 left-0"
             style="opacity: 0;" src="${getImageSrc(card)}"
             onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';" alt="Word Image" />
      </div>
      <span class="text-xs font-semibold text-yellow-600 bg-white border border-yellow-400 px-2 py-0.5 rounded-full shadow-sm">
        Hint
      </span>
    </button>`;
}

export function attachHintListeners() {
  document.querySelectorAll("#hint-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const section = e.target.closest(".card-inner");
      if (!section) return;
      const hintImg = section.querySelector(".hint-image");
      const fillerImg = section.querySelector(".filler-image");
      if (!hintImg || !fillerImg) return;

      fillerImg.style.opacity = "0";
      hintImg.style.opacity = "1";

      const rect = hintImg.getBoundingClientRect();
      triggerSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2);

      setTimeout(() => {
        hintImg.style.opacity = "0";
        fillerImg.style.opacity = "1";
      }, 3000);
    });
  });
}

export function removeHintBlock() {
  document.querySelectorAll(".hint-wrapper").forEach((el) => el.remove());
}
