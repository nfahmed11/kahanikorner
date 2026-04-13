import {
  buildDeck,
  getCardColor,
  getImageSrc,
  getUrdu,
  getEnglish,
  displayRoman,
  audio,
  setupMenu,
  renderHintBlock,
  attachHintListeners,
  removeHintBlock,
} from "./flashcard-utils.js";

// --------------------
// State
// --------------------
let currentIndex = 0;
let deck = [];
let isEnglishToUrdu = false;
let showImage = false;

// --------------------
// DOM
// --------------------
const flashcard = document.getElementById("flashcard");
const flashcardFront = document.getElementById("flashcard-front");
const flashcardBack = document.getElementById("flashcard-back");
const progressFill = document.querySelector(".progress-fill");
const progressText = document.getElementById("progress-text");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const toggleLangBtn = document.getElementById("toggle-lang");
const navButtons = document.getElementById("nav-buttons");
const toggleImageBtn = document.getElementById("toggle-image");
const menuToggle = document.getElementById("menu-toggle");
const menuDropdown = document.getElementById("menu-dropdown");

// --------------------
// Menu
// --------------------
const { closeMenu } = setupMenu(menuToggle, menuDropdown);

// --------------------
// Card color
// --------------------
function applyCardColor(index) {
  const color = getCardColor(index);
  flashcardFront.style.setProperty("--card-color", color);
  flashcardBack.style.setProperty("--card-color", color);
}

// --------------------
// Menu label updates
// --------------------
function updateMenuStates() {
  const langLabel = document.getElementById("toggle-lang-label");
  const imgLabel = document.getElementById("toggle-image-label");
  if (langLabel) langLabel.textContent = isEnglishToUrdu ? "Urdu → English" : "English → Urdu";
  if (imgLabel) imgLabel.textContent = showImage ? "Hide Image" : "Show Image";
  toggleImageBtn.classList.toggle("active", showImage);
}

// --------------------
// UI Events
// --------------------
toggleImageBtn.addEventListener("click", () => {
  showImage = !showImage;
  updateMenuStates();
  updateFlashcard(currentIndex);
  closeMenu();
});

toggleLangBtn.addEventListener("click", () => {
  isEnglishToUrdu = !isEnglishToUrdu;
  updateMenuStates();
  flashcard.classList.remove("flipped");
  updateFlashcard(currentIndex);
  closeMenu();
});

// --------------------
// Core render (review only)
// --------------------
function updateFlashcard(index) {
  const card = deck[index];
  const totalCards = ALLOWED_WORDS.size || deck.length;

  if (!deck.length) {
    flashcardFront.innerHTML =
      '<div class="card-inner"><div class="text-center text-gray-500">Deck is empty</div></div>';
    flashcardBack.innerHTML = "";
    return;
  }

  applyCardColor(index);
  progressFill.style.width = `${((index + 1) / totalCards) * 100}%`;
  progressText.textContent = `${index + 1}/${totalCards}`;

  if (!card || !card.word || !getEnglish(card)) {
    flashcardFront.innerHTML =
      '<div class="card-inner"><div class="text-center text-gray-500">No card data</div></div>';
    flashcardBack.innerHTML = "";
    return;
  }

  navButtons.style.display = "";
  flashcard.classList.remove("flipped");

  if (isEnglishToUrdu) {
    flashcardFront.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          ${renderHintBlock(card, { showImage })}
          <div class="text-center mt-2"><span class="lang-badge lang-badge--english">English</span></div>
          <div class="flex-grow flex justify-center items-center">
            <div class="text-4xl md:text-6xl font-bold word-english text-center break-words">${getEnglish(card)}</div>
          </div>
          <div class="card-prompt text-center mb-4">Tap card for Urdu</div>
        </div>
      </div>`;

    flashcardBack.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          <div class="text-center mt-2"><span class="lang-badge lang-badge--urdu">Urdu</span></div>
          <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
            <div class="text-4xl md:text-6xl font-bold word-roman break-words">${displayRoman(card)}</div>
            <div><img src="${getImageSrc(card)}"
                 onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';"
                 alt="Word Image" class="w-28 h-28 md:w-28 md:h-28 object-contain" /></div>
            <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu word-urdu break-words">${getUrdu(card)}</div>
          </div>
        </div>
      </div>`;
  } else {
    flashcardFront.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          ${renderHintBlock(card, { showImage })}
          <div class="text-center mt-2"><span class="lang-badge lang-badge--urdu">Urdu</span></div>
          <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
            <div class="text-4xl md:text-6xl font-bold word-roman break-words">${displayRoman(card)}</div>
            <div class="text-4xl md:text-6xl font-bold noto-nastaliq-urdu word-urdu break-words">${getUrdu(card)}</div>
          </div>
          <div class="card-prompt text-center mb-4">Tap card for English</div>
        </div>
      </div>`;

    flashcardBack.innerHTML = `
      <div class="card-inner">
        <div class="relative w-full h-full flex flex-col justify-between">
          <div class="text-center mt-2"><span class="lang-badge lang-badge--english">English</span></div>
          <div class="flex-grow flex flex-col justify-center items-center text-center gap-8">
            <div><img src="${getImageSrc(card)}"
                 onerror="this.onerror=null; this.src='/qr/assets/images/noimage.png';"
                 alt="Word Image" class="w-28 h-28 md:w-28 md:h-28 object-contain" /></div>
            <div class="text-6xl font-bold word-english text-center">${getEnglish(card)}</div>
          </div>
        </div>
      </div>`;
  }

  attachHintListeners();
}

// --------------------
// Listeners
// --------------------
flashcard.addEventListener("click", (e) => {
  if (e.target.closest("#hint-btn")) return;
  removeHintBlock();
  audio.cardFlip.currentTime = 0;
  audio.cardFlip.play().catch(() => {});
  const isNowFlipped = flashcard.classList.toggle("flipped");
  if (!isNowFlipped) {
    setTimeout(() => updateFlashcard(currentIndex), 500);
  }
});

prevBtn.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    updateFlashcard(currentIndex);
  }
});

nextBtn.addEventListener("click", () => {
  if (currentIndex < deck.length - 1) {
    currentIndex++;
    updateFlashcard(currentIndex);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") nextBtn.click();
  if (e.key === "ArrowLeft") prevBtn.click();
});

// --------------------
// Init
// --------------------
deck = buildDeck({ shuffle: true });
updateMenuStates();
updateFlashcard(currentIndex);
