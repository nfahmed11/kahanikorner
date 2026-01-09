import { riddles } from "../vocab.js";

// Now you can use the riddles array as before
console.log(riddles);

function launchConfetti() {
  const confettiContainer = document.createElement("div");
  confettiContainer.classList.add("confetti-container");

  for (let i = 0; i < 30; i++) {
    const confettiPiece = document.createElement("div");
    confettiPiece.classList.add("confetti");
    confettiPiece.style.left = `${Math.random() * 100}%`;
    confettiPiece.style.animationDelay = `${Math.random() * 2}s`;
    confettiPiece.style.backgroundColor = `hsl(${
      Math.random() * 360
    }, 100%, 70%)`;
    confettiContainer.appendChild(confettiPiece);
  }

  document.body.appendChild(confettiContainer);
  setTimeout(() => {
    confettiContainer.remove();
  }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
  const correctSound = new Audio("../sounds/success.wav");
  const incorrectSound = new Audio("../sounds/incorrect.wav");
  const targetImage = document.getElementById("target-image");
  const wordOptions = document.getElementById("word-options");
  const dropZone = document.getElementById("drop-zone");

  const timerDisplay = document.getElementById("timer");
  const scoreDisplay = document.getElementById("score");
  const timerToggle = document.getElementById("timer-toggle");
  const gameStatus = document.getElementById("game-status");
  let timer = 60;
  let score = 0;
  let gameInterval;

  function startGame() {
    score = 0;
    scoreDisplay.textContent = `Score: ${score}`;
    timer = 60;
    timerDisplay.textContent = `Time: ${timer}s`;
    timerDisplay.classList.remove("flash-red");

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
        alert(
          `Time's up! Your final score is: ${score}\n\nClick OK to restart.`
        );
        location.reload();
      }
    }, 1000);
  }

  function loadNewWord() {
    dropZone.innerHTML = "Select an Option";
    dropZone.classList.remove("correct", "incorrect");

    const word = riddles[Math.floor(Math.random() * riddles.length)];
    targetImage.src = word.image;
    targetImage.setAttribute("data-correct", word.word.urdu);
    wordOptions.innerHTML = "";

    let shuffledWords = riddles
      .filter((w) => w.word.urdu !== word.word.urdu)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);
    shuffledWords.push(word);
    shuffledWords.sort(() => 0.5 - Math.random());

    shuffledWords.forEach((w) => {
      const wordDiv = document.createElement("div");
      wordDiv.classList.add("word");
      wordDiv.setAttribute("data-urdu", w.word.urdu);
      wordDiv.setAttribute("data-roman", w.word.romanUrdu);
      wordDiv.innerHTML = `<div class="roman">${w.word.romanUrdu}</div><div class="urdu">${w.word.urdu}</div>`;

      wordDiv.addEventListener("click", () => {
        const correctWord = targetImage.getAttribute("data-correct");

        if (w.word.urdu === correctWord) {
          dropZone.innerHTML = `<div class="roman">${w.word.romanUrdu}</div><div class="urdu">${w.word.urdu}</div>`;
          dropZone.classList.add("correct");
          correctSound.play();
          launchConfetti();

          if (timerToggle.checked) {
            score++;
            scoreDisplay.textContent = `Score: ${score}`;
          }

          setTimeout(loadNewWord, 1500);
        } else {
          dropZone.classList.add("incorrect");
          incorrectSound.play();
          setTimeout(() => {
            dropZone.classList.remove("incorrect");
          }, 300);
        }
      });

      wordOptions.appendChild(wordDiv);
    });
  }

  loadNewWord();

  timerToggle.addEventListener("change", () => {
    clearInterval(gameInterval);
    if (timerToggle.checked) {
      gameStatus.classList.remove("hidden");
      startGame();
    } else {
      gameStatus.classList.add("hidden");
    }
  });
});
