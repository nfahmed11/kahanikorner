// ✅ import your BIG vocab file
import { vocab as originalVocab } from "./vocab.js";

console.log(
  "[tasveer] vocab loaded?",
  Array.isArray(originalVocab),
  originalVocab?.length,
);

// --------------------
// Helpers for NEW vocab schema
// --------------------


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


function getImageSrc(card) {
  return card?.image || "/qr/assets/images/noimage.png";
}

function hasValidImage(card) {
  return (
    card?.image &&
    typeof card.image === "string" &&
    !card.image.includes("noimage")
  );
}

function getRomanForms(card) {
  if (!card) return [];

  const forms = [];

  // base word
  if (card.word?.baseRomanUrdu) {
    forms.push(card.word.baseRomanUrdu);
  }

  // all variants
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
  const forms = getRomanForms(card);
  return forms.some((w) => window.ALLOWED_WORDS?.has(w));
}

function displayRoman(card) {
  const forms = getRomanForms(card);
  const matched = forms.find((w) => window.ALLOWED_WORDS?.has(w));
  return matched || getBaseRoman(card) || "";
}

let deck = [];

async function resetDeck() {
  const ALLOWED_WORDS = window.ALLOWED_WORDS;

  if (!(ALLOWED_WORDS instanceof Set)) {
    console.error(
      "[tasveer] window.ALLOWED_WORDS is missing or not a Set. " +
        "Make sure the ?words= param is in the URL and the HTML script block runs before matching.js",
    );
    deck = [];
    return;
  }

  if (!Array.isArray(originalVocab)) {
    console.error(
      "[tasveer] vocab import failed or not an array",
      originalVocab,
    );
    deck = [];
    return;
  }

  const vocabWords = new Set(originalVocab.flatMap((c) => getRomanForms(c)));

  const allowedCards = originalVocab.filter(matchesAllowed);

  const imageCheckResults = await Promise.all(
    allowedCards.map(async (card) => {
      const ok = hasImagePath(card) && (await imageLoads(card.image));
      return { card, ok };
    }),
  );

  deck = imageCheckResults
    .filter((result) => result.ok)
    .map((result) => result.card);

  const loaded = deck.map((card) => displayRoman(card));
  const missingWords = [...ALLOWED_WORDS].filter((w) => !vocabWords.has(w));
  const skippedNoImage = imageCheckResults
    .filter((result) => !result.ok)
    .map((result) => displayRoman(result.card));

  console.log("========== TASVEER DEBUG ==========");
  console.log("[tasveer] Total ALLOWED_WORDS:", ALLOWED_WORDS?.size ?? 0);
  console.log("[tasveer] ALLOWED_WORDS:", [...ALLOWED_WORDS]);
  console.log("[tasveer] Total vocab roman forms available:", vocabWords.size);
  console.log("[tasveer] Total words loaded into deck:", deck.length);
  console.log("[tasveer] Loaded words:", loaded);

  if (missingWords.length) {
    console.warn("[tasveer] ❌ Words NOT found in vocab.js:", missingWords);
  } else {
    console.log("[tasveer] ✅ All ALLOWED_WORDS found in vocab.js");
  }

  if (skippedNoImage.length) {
    console.warn(
      "[tasveer] ❌ Skipped words with missing/broken images:",
      skippedNoImage,
    );
  }

  console.log("===================================");

  if (deck.length === 0) {
    console.warn("[tasveer] deck empty after filtering.");
    console.warn(
      "[tasveer] sample vocab baseRomanUrdu:",
      originalVocab.slice(0, 20).map((v) => v.word?.baseRomanUrdu),
    );
  }
}

function launchConfetti() {
  const confettiContainer = document.createElement("div");
  confettiContainer.className = "confetti-container";

  for (let i = 0; i < 40; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = `${Math.random() * 100}%`;
    c.style.width = `${6 + Math.random() * 8}px`;
    c.style.height = `${6 + Math.random() * 8}px`;
    c.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
    c.style.animationDelay = `${Math.random() * 0.2}s`;
    c.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
    confettiContainer.appendChild(c);
  }

  document.body.appendChild(confettiContainer);
  setTimeout(() => confettiContainer.remove(), 2500);
}

document.addEventListener("DOMContentLoaded", async () => {
  const correctSound = new Audio("/qr/assets/audio/success.wav");
  const incorrectSound = new Audio("/qr/assets/audio/incorrect.wav");

  const targetImage = document.getElementById("target-image");
  const wordOptions = document.getElementById("word-options");
  const dropZone = document.getElementById("drop-zone");

  const timerDisplay = document.getElementById("timer");
  const scoreDisplay = document.getElementById("score");
  const timerToggle = document.getElementById("timer-toggle");
  const gameStatus = document.getElementById("game-status");
  const timerStatusLabel = document.getElementById("timer-status-label");

  if (!targetImage || !wordOptions || !dropZone) {
    console.error("[tasveer] Missing required DOM elements.");
    return;
  }

  await resetDeck();

  if (!deck.length) {
    dropZone.textContent = "No words loaded (deck is empty)";
    return;
  }

  let timer = 60;
  let score = 0;
  let gameInterval;

  function startGame() {
    score = 0;
    scoreDisplay.textContent = `Score: ${score}`;

    timer = 60;
    timerDisplay.textContent = `Time: ${timer}s`;
    timerDisplay.classList.remove("flash-red");

    clearInterval(gameInterval);
    gameInterval = setInterval(() => {
      if (timer > 0) {
        timer--;
        timerDisplay.textContent = `Time: ${timer}s`;

        if (timer <= 5) {
          timerDisplay.classList.add("flash-red");
        } else {
          timerDisplay.classList.remove("flash-red");
        }
      } else {
        clearInterval(gameInterval);
        const finalScore = document.getElementById("final-score");
        const gameOverModal = document.getElementById("game-over-modal");

        if (finalScore) finalScore.textContent = score;
        if (gameOverModal) gameOverModal.classList.remove("hidden");
      }
    }, 1000);
  }

  function loadNewWord() {
    if (!deck.length) {
      dropZone.textContent = "No words loaded";
      return;
    }

    dropZone.innerHTML = "Choose the correct word!";
    dropZone.classList.remove("correct", "incorrect", "answered");
    wordOptions.innerHTML = "";

    const correctCard = deck[Math.floor(Math.random() * deck.length)];
    const correctUrdu = getUrdu(correctCard);

    targetImage.src = correctCard.image;
    targetImage.setAttribute("data-correct-urdu", correctUrdu);

    const wrongChoices = deck
      .filter((c) => getUrdu(c) !== correctUrdu)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);

    const options = [...wrongChoices, correctCard].sort(
      () => 0.5 - Math.random(),
    );

    options.forEach((card) => {
      const cardUrdu = getUrdu(card);

      const wordDiv = document.createElement("div");
      wordDiv.classList.add("word");
      wordDiv.setAttribute("data-urdu", cardUrdu);

      wordDiv.innerHTML = `
        <div class="roman">${displayRoman(card)}</div>
        <div class="urdu">${cardUrdu}</div>
      `;

      wordDiv.addEventListener("click", () => {
        if (dropZone.classList.contains("answered")) return;

        const correctUrduValue = targetImage.getAttribute("data-correct-urdu");

        document.querySelectorAll(".word").forEach((btn) => {
          btn.style.pointerEvents = "none";
          btn.style.opacity = "0.6";
        });

        dropZone.classList.add("answered");

        if (cardUrdu === correctUrduValue) {
          dropZone.innerHTML = `
            <div class="roman">${displayRoman(card)}</div>
            <div class="urdu">${cardUrdu}</div>
          `;
          dropZone.classList.add("correct");

          correctSound.currentTime = 0;
          correctSound.play().catch(() => {});
          launchConfetti();

          if (timerToggle?.checked) {
            score++;
            scoreDisplay.textContent = `Score: ${score}`;
          }
        } else {
          dropZone.classList.add("incorrect");

          incorrectSound.currentTime = 0;
          incorrectSound.play().catch(() => {});

          const correctOption = [...document.querySelectorAll(".word")].find(
            (btn) => btn.getAttribute("data-urdu") === correctUrduValue,
          );

          if (correctOption) {
            correctOption.style.border = "2px solid var(--correct)";
            correctOption.style.background =
              "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.2))";
            correctOption.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.5)";
          }
        }

        setTimeout(() => {
          document
            .querySelectorAll(".word")
            .forEach((btn) => btn.removeAttribute("style"));
          loadNewWord();
        }, 1500);
      });

      wordOptions.appendChild(wordDiv);
    });
  }

  loadNewWord();

  timerToggle?.addEventListener("change", () => {
    clearInterval(gameInterval);

    if (timerToggle.checked) {
      if (timerStatusLabel) timerStatusLabel.textContent = "Timer ON";
      if (gameStatus) gameStatus.classList.remove("hidden");
      startGame();
    } else {
      if (timerStatusLabel) timerStatusLabel.textContent = "Timer OFF";
      if (gameStatus) gameStatus.classList.add("hidden");
    }
  });

  document.getElementById("restart-button")?.addEventListener("click", () => {
    location.reload();
  });
});
