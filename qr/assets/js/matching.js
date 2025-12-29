console.log("[tasveer] script loaded");

// ✅ grab allowed words from HTML
const ALLOWED_WORDS = window.ALLOWED_WORDS;

if (!(ALLOWED_WORDS instanceof Set)) {
  console.error(
    "[tasveer] window.ALLOWED_WORDS is missing or not a Set. " +
      "Make sure you set window.ALLOWED_WORDS in HTML BEFORE loading matching.js"
  );
}

// ✅ import your BIG vocab file (tons of words)
// IMPORTANT: path must be correct relative to /assets/js/matching.js
// If vocab.js is at /assets/vocab.js => use "../vocab.js"
// If vocab.js is at root /vocab.js => use "/vocab.js"
import { vocab as originalVocab } from "./vocab.js";

console.log(
  "[tasveer] vocab loaded?",
  Array.isArray(originalVocab),
  originalVocab?.length
);

let deck = [];

function resetDeck() {
  if (!Array.isArray(originalVocab)) {
    console.error(
      "[tasveer] vocab import failed or not an array",
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

  console.log("[tasveer] deck rebuilt", {
    deckLength: deck.length,
    words: deck.map((c) => c.word?.romanUrdu),
  });

  if (deck.length === 0) {
    console.warn("[tasveer] deck empty after filtering.");
    console.warn(
      "[tasveer] sample romanUrdu in vocab:",
      originalVocab.slice(0, 20).map((v) => v.word?.romanUrdu)
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

document.addEventListener("DOMContentLoaded", () => {
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

  resetDeck();

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
        if (timer <= 5) timerDisplay.classList.add("flash-red");
        else timerDisplay.classList.remove("flash-red");
      } else {
        clearInterval(gameInterval);
        document.getElementById("final-score").textContent = score;
        document.getElementById("game-over-modal").classList.remove("hidden");
      }
    }, 1000);
  }

  function loadNewWord() {
    dropZone.innerHTML = "Choose the correct word!";
    dropZone.classList.remove("correct", "incorrect", "answered");
    wordOptions.innerHTML = "";

    const correctCard = deck[Math.floor(Math.random() * deck.length)];
    targetImage.src = correctCard.image;
    targetImage.setAttribute("data-correct-urdu", correctCard.word.urdu);

    const wrongChoices = deck
      .filter((c) => c.word.urdu !== correctCard.word.urdu)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);

    const options = [...wrongChoices, correctCard].sort(
      () => 0.5 - Math.random()
    );

    options.forEach((card) => {
      const wordDiv = document.createElement("div");
      wordDiv.classList.add("word");
      wordDiv.setAttribute("data-urdu", card.word.urdu);

      wordDiv.innerHTML = `
        <div class="roman">${card.word.romanUrdu}</div>
        <div class="urdu">${card.word.urdu}</div>
      `;

      wordDiv.addEventListener("click", () => {
        if (dropZone.classList.contains("answered")) return;

        const correctUrdu = targetImage.getAttribute("data-correct-urdu");

        document.querySelectorAll(".word").forEach((btn) => {
          btn.style.pointerEvents = "none";
          btn.style.opacity = "0.6";
        });

        dropZone.classList.add("answered");

        if (card.word.urdu === correctUrdu) {
          dropZone.innerHTML = `
            <div class="roman">${card.word.romanUrdu}</div>
            <div class="urdu">${card.word.urdu}</div>
          `;
          dropZone.classList.add("correct");

          correctSound.currentTime = 0;
          correctSound.play().catch(() => {});
          launchConfetti();

          if (timerToggle.checked) {
            score++;
            scoreDisplay.textContent = `Score: ${score}`;
          }
        } else {
          dropZone.classList.add("incorrect");

          incorrectSound.currentTime = 0;
          incorrectSound.play().catch(() => {});

          const correctOption = [...document.querySelectorAll(".word")].find(
            (btn) => btn.getAttribute("data-urdu") === correctUrdu
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

  timerToggle.addEventListener("change", () => {
    clearInterval(gameInterval);

    if (timerToggle.checked) {
      timerStatusLabel.textContent = "Timer ON";
      gameStatus.classList.remove("hidden");
      startGame();
    } else {
      timerStatusLabel.textContent = "Timer OFF";
      gameStatus.classList.add("hidden");
    }
  });

  document.getElementById("restart-button").addEventListener("click", () => {
    location.reload();
  });
});
