/**
 * fillblank.js — Kahani Korner · Fill-in-the-Blank AI Game
 * ─────────────────────────────────────────────────────────────
 * Lives at: /qr/assets/js/fillblank.js
 *
 * Vocab:     imports mastervocab.js from same folder (./mastervocab.js)
 *            filtered by window.ALLOWED_WORDS (from ?words= URL param)
 *
 * Sentences: POST /api/generate-sentence → Firebase Function → OpenAI
 *            (locally: Express server in qr/assets/ai-activities/fillblank/)
 *
 * To swap AI backend: edit only fetchSentence() below.
 */

"use strict";

import { vocab as masterVocab } from "./mastervocab.js";

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const SETTINGS_KEY   = "kk-fillblank-settings";
const API_ENDPOINT   = "/api/generate-sentence";
const WORD_BANK_SIZE = 5;   // 1 correct + 4 distractors
const REVEAL_AFTER   = 3;   // show "show answer" after N wrong attempts

// ─────────────────────────────────────────────────────────────
// DEFAULT SETTINGS
// ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  difficulty:     "easy",
  wordBankScript: "roman",  // "roman" | "urdu"
  showUrdu:       true,
  showRoman:      true,
  showEnglish:    false,
  soundEnabled:   true,
  autoNext:       false,
};

// ─────────────────────────────────────────────────────────────
// FEEDBACK COPY
// ─────────────────────────────────────────────────────────────

const FEEDBACK = {
  correct: [
    "Nice job! 🎉", "That's right!", "You got it!", "Great work!",
    "Excellent!", "Shabash! (Well done!)", "Bilkul sahi! (Exactly right!)",
    "Wah wah! Keep it up!", "Brilliant!",
  ],
  incorrect: [
    "Oops, try another one.", "Not quite — give it another go!",
    "Almost! Try again.", "Keep going, you've got this!",
    "That's okay — try a different one.",
  ],
};

// ─────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────

const SFX = (() => {
  let correct, incorrect;
  return {
    play(name) {
      try {
        if (name === "correct") {
          correct = correct || new Audio("/qr/assets/audio/success.wav");
          correct.currentTime = 0;
          correct.play().catch(() => {});
        } else if (name === "incorrect") {
          incorrect = incorrect || new Audio("/qr/assets/audio/incorrect.wav");
          incorrect.currentTime = 0;
          incorrect.play().catch(() => {});
        }
      } catch (_) {}
    },
  };
})();

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

let settings   = { ...DEFAULT_SETTINGS };
let pool       = [];
let usedIds    = [];
let currentQ   = null;
let answered   = false;
let wrongCount = 0;
let score      = { correct: 0, total: 0 };
let streak     = 0;

// ─────────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────────

const dom = {
  scoreCorrect:    q("#score-correct"),
  scoreTotal:      q("#score-total"),
  streakBadge:     q("#streak-badge"),
  progressFill:    q("#progress-fill"),
  progressLabel:   q("#progress-label"),
  stateLoading:    q("#state-loading"),
  stateError:      q("#state-error"),
  stateQuestion:   q("#state-question"),
  errorMsg:        q("#error-msg"),
  errorRetry:      q("#error-retry-btn"),
  difficultyBadge: q("#difficulty-badge"),
  wordHint:        q("#word-hint"),
  rowUrdu:         q("#row-urdu"),
  rowRoman:        q("#row-roman"),
  rowEnglish:      q("#row-english"),
  sentenceUrdu:    q("#sentence-urdu"),
  sentenceRoman:   q("#sentence-roman"),
  sentenceEnglish: q("#sentence-english"),
  feedbackArea:    q("#feedback-area"),
  wordBank:        q("#word-bank"),
  revealBtn:       q("#reveal-btn"),
  nextBtn:         q("#next-btn"),
  confettiBox:     q("#confetti-container"),
};

function q(sel) {
  const el = document.querySelector(sel);
  if (!el) console.warn(`[fillblank] Missing DOM element: "${sel}"`);
  return el;
}

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (stored) settings = { ...DEFAULT_SETTINGS, ...stored };
  } catch (_) {}
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  qAll(".difficulty-pill").forEach((p) =>
    p.classList.toggle("active", p.dataset.value === settings.difficulty)
  );
  qAll(".script-pill").forEach((p) =>
    p.classList.toggle("active", p.dataset.value === settings.wordBankScript)
  );
  setToggle("toggle-urdu",     settings.showUrdu);
  setToggle("toggle-roman",    settings.showRoman);
  setToggle("toggle-english",  settings.showEnglish);
  setToggle("toggle-sound",    settings.soundEnabled);
  setToggle("toggle-autonext", settings.autoNext);
  applySentenceVisibility();
}

function setToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.setAttribute("aria-checked", String(val));
}

function applySentenceVisibility() {
  dom.rowUrdu.hidden    = !settings.showUrdu;
  dom.rowRoman.hidden   = !settings.showRoman;
  dom.rowEnglish.hidden = !settings.showEnglish;
}

// ─────────────────────────────────────────────────────────────
// VOCAB POOL
// Cross-references window.ALLOWED_WORDS (Set from ?words= param)
// with mastervocab.js — matches on id OR baseRomanUrdu.
// ─────────────────────────────────────────────────────────────

function buildPool() {
  const allowed = window.ALLOWED_WORDS;

  if (!allowed || allowed.size === 0) {
    pool = [...masterVocab];
    return;
  }

  pool = masterVocab.filter((entry) =>
    allowed.has(entry.id) || allowed.has(entry.word?.baseRomanUrdu)
  );

  const missing = [...allowed].filter(
    (w) => !masterVocab.some((e) => e.id === w || e.word?.baseRomanUrdu === w)
  );
  if (missing.length) {
    console.warn("[fillblank] IDs not found in mastervocab:", missing);
  }

  if (pool.length === 0) {
    console.error("[fillblank] Pool empty — falling back to full vocab.");
    pool = [...masterVocab];
  }
}

// ─────────────────────────────────────────────────────────────
// WORD PICKER  (cycles all before repeating)
// ─────────────────────────────────────────────────────────────

function pickWord() {
  if (pool.length === 0) return null;
  if (usedIds.length >= pool.length) usedIds = [];
  const available = pool.filter((w) => !usedIds.includes(w.id));
  const word = available[Math.floor(Math.random() * available.length)];
  usedIds.push(word.id);
  return word;
}

// ─────────────────────────────────────────────────────────────
// API LAYER — only thing that talks to the server
// To swap AI backends: edit only this function.
// ─────────────────────────────────────────────────────────────

async function fetchSentence(wordObj, difficulty) {
  const payload = {
    word: {
      id:        wordObj.id,
      urdu:      wordObj.word.baseUrdu,
      romanUrdu: wordObj.word.baseRomanUrdu,
      english:   wordObj.word.english,
      pos:       wordObj.word.pos             || "unknown",
      gender:    wordObj.grammar?.baseGender  || "unknown",
      variants:  (wordObj.variants || []).map((v) => ({
        urdu:      v.urdu,
        romanUrdu: v.romanUrdu,
      })),
    },
    difficulty,
  };

  const res  = await fetch(API_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || `Server error ${res.status}`);
  }

  return data.sentence;
}

// ─────────────────────────────────────────────────────────────
// WORD BANK BUILDER
// ─────────────────────────────────────────────────────────────

function buildWordBank(targetWordObj, sentence) {
  const correctChip = {
    display:   settings.wordBankScript === "urdu" ? sentence.answerUrdu : sentence.answerRoman,
    roman:     sentence.answerRoman,
    urdu:      sentence.answerUrdu,
    isCorrect: true,
  };

  const distractors = pool
    .filter((w) => w.id !== targetWordObj.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, WORD_BANK_SIZE - 1)
    .map((w) => ({
      display:   settings.wordBankScript === "urdu"
        ? (w.word.baseUrdu      || w.word.baseRomanUrdu)
        : (w.word.baseRomanUrdu || w.word.baseUrdu),
      roman:     w.word.baseRomanUrdu,
      urdu:      w.word.baseUrdu,
      isCorrect: false,
    }));

  return [...distractors, correctChip].sort(() => Math.random() - 0.5);
}

// ─────────────────────────────────────────────────────────────
// GAME LAYER
// ─────────────────────────────────────────────────────────────

async function buildQuestion(wordObj, difficulty) {
  const sentence = await fetchSentence(wordObj, difficulty);
  const wordBank = buildWordBank(wordObj, sentence);
  return { wordObj, sentence, wordBank };
}

// ─────────────────────────────────────────────────────────────
// RENDER LAYER
// ─────────────────────────────────────────────────────────────

function showState(state) {
  dom.stateLoading.hidden  = state !== "loading";
  dom.stateError.hidden    = state !== "error";
  dom.stateQuestion.hidden = state !== "question";
}

function renderQuestion({ wordObj, sentence, wordBank }) {
  dom.difficultyBadge.textContent        = capitalize(sentence.level);
  dom.difficultyBadge.dataset.difficulty = sentence.level;
  dom.wordHint.textContent = wordObj.word.english
    ? `Hint: "${wordObj.word.english}"` : "";

  dom.sentenceUrdu.textContent    = sentence.urduBlank;
  dom.sentenceRoman.textContent   = sentence.romanBlank;
  dom.sentenceEnglish.textContent = sentence.englishTranslation;

  dom.sentenceUrdu.classList.remove("revealed");
  dom.sentenceRoman.classList.remove("revealed");

  applySentenceVisibility();
  renderWordBank(wordBank);
  clearFeedback();

  dom.nextBtn.hidden   = true;
  dom.revealBtn.hidden = true;
  wrongCount = 0;
}

function renderWordBank(wordBank) {
  dom.wordBank.innerHTML = "";
  wordBank.forEach((chip) => {
    const btn = document.createElement("button");
    btn.type        = "button";
    btn.className   = "word-chip" + (settings.wordBankScript === "urdu" ? " urdu" : "");
    btn.textContent = chip.display;
    btn.addEventListener("click", () => handleAnswer(chip, btn));
    dom.wordBank.appendChild(btn);
  });
}

function revealSentence(sentence) {
  if (settings.showUrdu) {
    dom.sentenceUrdu.textContent = sentence.urduFull;
    dom.sentenceUrdu.classList.add("revealed");
  }
  if (settings.showRoman) {
    dom.sentenceRoman.textContent = sentence.romanFull;
    dom.sentenceRoman.classList.add("revealed");
  }
}

// ─────────────────────────────────────────────────────────────
// ANSWER HANDLING
// ─────────────────────────────────────────────────────────────

function handleAnswer(chip, btnEl) {
  if (answered) return;

  const allChips = qAll(".word-chip");

  if (chip.isCorrect) {
    answered = true;
    score.correct++;
    score.total++;
    streak++;
    wrongCount = 0;

    btnEl.classList.add("chip--correct");
    allChips.forEach((b) => { b.disabled = true; });

    showFeedback("correct");
    revealSentence(currentQ.sentence);
    dom.nextBtn.hidden   = false;
    dom.revealBtn.hidden = true;

    updateScoreboard();
    if (settings.soundEnabled) SFX.play("correct");
    launchConfetti();
    if (settings.autoNext) setTimeout(loadNextQuestion, 1700);

  } else {
    wrongCount++;
    score.total++;
    streak = 0;

    btnEl.classList.add("chip--wrong");
    btnEl.disabled = true;

    showFeedback("incorrect");
    updateScoreboard();
    if (settings.soundEnabled) SFX.play("incorrect");
    if (wrongCount >= REVEAL_AFTER) dom.revealBtn.hidden = false;
  }

  updateStreak();
}

// ─────────────────────────────────────────────────────────────
// FEEDBACK
// ─────────────────────────────────────────────────────────────

function showFeedback(type) {
  const msgs = FEEDBACK[type] || [];
  dom.feedbackArea.textContent = msgs[Math.floor(Math.random() * msgs.length)] || "";
  dom.feedbackArea.className   = `feedback-area feedback--${type}`;
}

function clearFeedback() {
  dom.feedbackArea.textContent = "";
  dom.feedbackArea.className   = "feedback-area";
}

// ─────────────────────────────────────────────────────────────
// SCOREBOARD
// ─────────────────────────────────────────────────────────────

function updateScoreboard() {
  dom.scoreCorrect.textContent  = score.correct;
  dom.scoreTotal.textContent    = score.total;
  dom.progressLabel.textContent = `${score.correct} / ${score.total}`;

  const pct = score.total > 0
    ? Math.round((score.correct / score.total) * 100) : 0;
  dom.progressFill.style.width = `${pct}%`;
  dom.progressFill.parentElement.setAttribute("aria-valuenow", pct);
}

function updateStreak() {
  dom.streakBadge.textContent = streak >= 2 ? `🔥 ${streak}` : "";
}

// ─────────────────────────────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────────────────────────────

function launchConfetti() {
  const colors = ["#a78bfa","#f472b6","#34d399","#fbbf24","#60a5fa","#fb923c","#c084fc"];
  for (let i = 0; i < 40; i++) {
    const dot  = document.createElement("div");
    const size = 5 + Math.random() * 9;
    dot.className = "confetti-dot";
    dot.style.cssText = `
      left:${30 + Math.random() * 40}%;
      width:${size}px;height:${size}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.4 ? "50%" : "2px"};
      animation-delay:${Math.random() * 0.5}s;
      animation-duration:${0.9 + Math.random() * 0.7}s;
    `;
    dom.confettiBox.appendChild(dot);
  }
  setTimeout(() => { dom.confettiBox.innerHTML = ""; }, 2200);
}

// ─────────────────────────────────────────────────────────────
// QUESTION LOADER
// ─────────────────────────────────────────────────────────────

async function loadNextQuestion() {
  answered = false;
  currentQ = null;
  showState("loading");

  const wordObj = pickWord();
  if (!wordObj) {
    dom.errorMsg.textContent = "No vocabulary words found. Check the ?words= URL parameter.";
    showState("error");
    return;
  }

  try {
    currentQ = await buildQuestion(wordObj, settings.difficulty);
    renderQuestion(currentQ);
    showState("question");
  } catch (err) {
    console.error("[fillblank] Question load failed:", err);
    dom.errorMsg.textContent = err.message || "Could not generate a sentence. Please try again.";
    showState("error");
  }
}

// ─────────────────────────────────────────────────────────────
// SETTINGS EVENTS
// ─────────────────────────────────────────────────────────────

function bindSettingsEvents() {
  qAll(".difficulty-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      settings.difficulty = pill.dataset.value;
      saveSettings();
      applySettings();
    });
  });

  qAll(".script-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      settings.wordBankScript = pill.dataset.value;
      saveSettings();
      applySettings();
      if (currentQ) renderWordBank(currentQ.wordBank);
    });
  });

  [
    ["toggle-urdu",     "showUrdu"],
    ["toggle-roman",    "showRoman"],
    ["toggle-english",  "showEnglish"],
    ["toggle-sound",    "soundEnabled"],
    ["toggle-autonext", "autoNext"],
  ].forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener("click", () => {
      settings[key] = !settings[key];
      saveSettings();
      applySettings();
      if (["showUrdu","showRoman","showEnglish"].includes(key)) {
        applySentenceVisibility();
        if (answered && currentQ) revealSentence(currentQ.sentence);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────
// KEYBOARD
// ─────────────────────────────────────────────────────────────

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !dom.nextBtn.hidden) {
      e.preventDefault();
      loadNextQuestion();
      return;
    }
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 5) {
      qAll(".word-chip:not(:disabled)")[num - 1]?.click();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function qAll(sel) { return [...document.querySelectorAll(sel)]; }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ─────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────

function init() {
  loadSettings();
  buildPool();
  bindSettingsEvents();
  bindKeyboard();
  applySettings();
  updateScoreboard();

  dom.nextBtn?.addEventListener("click", loadNextQuestion);
  dom.errorRetry?.addEventListener("click", loadNextQuestion);

  dom.revealBtn?.addEventListener("click", () => {
    if (!currentQ || answered) return;
    answered = true;
    dom.revealBtn.hidden = true;

    qAll(".word-chip").forEach((btn) => {
      const isCorrect = btn.textContent === (
        settings.wordBankScript === "urdu"
          ? currentQ.sentence.answerUrdu
          : currentQ.sentence.answerRoman
      );
      if (isCorrect) btn.classList.add("chip--correct");
      btn.disabled = true;
    });

    revealSentence(currentQ.sentence);
    dom.nextBtn.hidden           = false;
    dom.feedbackArea.textContent = "Here's the answer — keep going!";
    dom.feedbackArea.className   = "feedback-area feedback--reveal";
  });

  loadNextQuestion();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
