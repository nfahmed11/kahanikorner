import { vocab as originalVocab } from "./mastervocab.js";

// --------------------
// Vocab helpers
// --------------------
function getRomanForms(card) {
  if (!card) return [];
  const forms = [];
  if (card.word?.baseRomanUrdu) forms.push(card.word.baseRomanUrdu);
  if (Array.isArray(card.variants)) {
    card.variants.forEach((v) => { if (v?.romanUrdu) forms.push(v.romanUrdu); });
  }
  return [...new Set(forms)];
}

function getUrdu(card) { return card?.word?.baseUrdu || ""; }
function getEnglish(card) { return card?.word?.english || ""; }

function displayRoman(card) {
  const forms = getRomanForms(card);
  const matched = forms.find((w) => window.ALLOWED_WORDS?.has(w));
  return matched || card?.word?.baseRomanUrdu || "";
}

function matchesAllowed(card) {
  return getRomanForms(card).some((w) => window.ALLOWED_WORDS?.has(w));
}

function imageLoads(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

// --------------------
// Audio
// --------------------
const correctSound = new Audio("/qr/assets/audio/success.wav");
const incorrectSound = new Audio("/qr/assets/audio/incorrect.wav");

// --------------------
// Build deck (only cards with working images)
// --------------------
async function buildDeck() {
  if (!Array.isArray(originalVocab)) return [];

  const allowed = originalVocab.filter(matchesAllowed);

  const results = await Promise.all(
    allowed.map(async (card) => {
      const ok = card?.image && typeof card.image === "string" &&
        !card.image.includes("noimage") && (await imageLoads(card.image));
      return { card, ok };
    })
  );

  const deck = results.filter((r) => r.ok).map((r) => r.card);

  console.log(`[match] Deck: ${deck.length} cards with valid images`);
  return deck;
}

// --------------------
// Particle burst effect
// --------------------
function burstParticles(x, y) {
  const container = document.createElement("div");
  container.className = "particle-burst";
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;

  const colors = ["#e91e90", "#00c9b7", "#84cc16", "#f472b6", "#38bdf8", "#fbbf24"];

  for (let i = 0; i < 14; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const angle = (Math.PI * 2 * i) / 14;
    const dist = 40 + Math.random() * 50;
    p.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
    p.style.background = colors[i % colors.length];
    container.appendChild(p);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 800);
}

// --------------------
// Streak flash bar
// --------------------
function showStreakFlash() {
  const bar = document.createElement("div");
  bar.className = "streak-flash";
  document.body.appendChild(bar);
  setTimeout(() => bar.remove(), 700);
}

// --------------------
// Game
// --------------------
document.addEventListener("DOMContentLoaded", async () => {
  const imageCard = document.getElementById("image-card");
  const targetImage = document.getElementById("target-image");
  const answersEl = document.getElementById("answers");
  const feedbackEl = document.getElementById("feedback");
  const progressText = document.getElementById("progress-text");
  const streakText = document.getElementById("streak-text");
  const completeModal = document.getElementById("complete-modal");
  const modalEmoji = document.getElementById("modal-emoji");
  const modalTitle = document.getElementById("modal-title");
  const modalStat = document.getElementById("modal-stat");
  const playAgainBtn = document.getElementById("play-again-btn");

  const deck = await buildDeck();

  if (!deck.length) {
    const game = document.querySelector(".game");
    game.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📸</div>
        <p>No pictures available for these words yet.</p>
      </div>`;
    return;
  }

  // Shuffle and create a finite round
  let round = [];
  let roundIndex = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctCount = 0;

  function newRound() {
    round = [...deck].sort(() => Math.random() - 0.5);
    roundIndex = 0;
    streak = 0;
    correctCount = 0;
    updateStats();
  }

  function updateStats() {
    progressText.textContent = `${Math.min(roundIndex + 1, round.length)}/${round.length}`;
    streakText.textContent = streak;
  }

  function showFeedback(text, type) {
    feedbackEl.textContent = text;
    feedbackEl.className = `feedback feedback--${type}`;
    setTimeout(() => { feedbackEl.className = "feedback hidden"; }, 1200);
  }

  // Encouraging phrases
  const correctPhrases = ["Shabash!", "Wah wah!", "Zabardast!", "Sahi jawab!", "Bohat acha!"];
  const wrongPhrases = ["Koi baat nahi!", "Agla try!", "Dobara koshish!"];

  function loadCard() {
    if (roundIndex >= round.length) {
      showComplete();
      return;
    }

    const card = round[roundIndex];
    updateStats();

    // Reset states
    imageCard.className = "image-card";
    feedbackEl.className = "feedback hidden";
    answersEl.innerHTML = "";

    // Set image
    targetImage.src = card.image;

    // Build options: 1 correct + 2 wrong
    const correctUrdu = getUrdu(card);
    const wrongs = deck
      .filter((c) => getUrdu(c) !== correctUrdu)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

    const options = [...wrongs, card].sort(() => Math.random() - 0.5);

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "answer-btn";
      btn.type = "button";
      const optUrdu = getUrdu(opt);
      const isCorrect = optUrdu === correctUrdu;

      btn.innerHTML = `
        <span class="roman">${displayRoman(opt)}</span>
        <span class="sep">|</span>
        <span class="urdu">${optUrdu}</span>`;

      btn.addEventListener("click", (e) => handleAnswer(e, btn, isCorrect, correctUrdu));
      answersEl.appendChild(btn);
    });
  }

  function handleAnswer(e, clickedBtn, isCorrect, correctUrdu) {
    // Disable all buttons
    const allBtns = answersEl.querySelectorAll(".answer-btn");
    allBtns.forEach((b) => { b.disabled = true; });

    if (isCorrect) {
      // Correct!
      clickedBtn.classList.add("correct");
      imageCard.classList.add("correct");

      correctSound.currentTime = 0;
      correctSound.play().catch(() => {});

      // Particles from the clicked button
      const rect = clickedBtn.getBoundingClientRect();
      burstParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);

      streak++;
      correctCount++;
      if (streak > bestStreak) bestStreak = streak;

      // Streak milestones
      if (streak > 0 && streak % 3 === 0) {
        showStreakFlash();
        showFeedback(`🔥 ${streak} streak!`, "correct");
      } else {
        const phrase = correctPhrases[Math.floor(Math.random() * correctPhrases.length)];
        showFeedback(phrase, "correct");
      }
    } else {
      // Wrong
      clickedBtn.classList.add("wrong");
      imageCard.classList.add("wrong");

      incorrectSound.currentTime = 0;
      incorrectSound.play().catch(() => {});

      // Reveal the correct answer
      allBtns.forEach((b) => {
        const btnUrdu = b.querySelector(".urdu")?.textContent;
        if (btnUrdu === correctUrdu) {
          b.classList.add("reveal");
        }
      });

      streak = 0;

      const phrase = wrongPhrases[Math.floor(Math.random() * wrongPhrases.length)];
      showFeedback(phrase, "wrong");
    }

    updateStats();

    // Next card after delay
    setTimeout(() => {
      roundIndex++;
      loadCard();
    }, 1600);
  }

  function showComplete() {
    const total = round.length;
    const pct = Math.round((correctCount / total) * 100);

    let emoji = "🎉";
    let title = "Kamaal kar diya!";
    if (pct < 50) { emoji = "💪"; title = "Acha try!"; }
    else if (pct < 80) { emoji = "⭐"; title = "Bohat acha!"; }
    else if (pct < 100) { emoji = "🌟"; title = "Laajawab!"; }

    modalEmoji.textContent = emoji;
    modalTitle.textContent = title;
    modalStat.textContent = `${correctCount}/${total} correct — Best streak: ${bestStreak}`;

    completeModal.classList.remove("hidden");
  }

  playAgainBtn.addEventListener("click", () => {
    completeModal.classList.add("hidden");
    newRound();
    loadCard();
  });

  // Start
  newRound();
  loadCard();
});
