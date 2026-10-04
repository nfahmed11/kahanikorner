/*
 * Urdu Mad Lib — Game Engine
 * Answer entry → story reveal · English toggle · copy · replay
 * Data: games.madLib.game in the monthly index.html's issue-config (via issue-loader.js),
 *       selected by ?issue=<slug>
 * Player answers are only ever inserted with textContent — never innerHTML.
 */

var EMPTY_FIELD_MSG = "Pehle yeh blank bhi bhar dein.";
var COPY_RESET_MS = 2000;

var issue = null;
var answers = {};

function isPlayable(game) {
  return Array.isArray(game.fields) && game.fields.length > 0 &&
    Array.isArray(game.romanUrdu) && Array.isArray(game.english);
}

function emptyAnswers() {
  var result = {};
  issue.fields.forEach(function (field) { result[field.id] = ""; });
  return result;
}

// ── Form rendering ───────────────────────────────────────────────────────────
function renderFields() {
  var container = document.getElementById("ml-fields");

  issue.fields.forEach(function (field, i) {
    var inputId = "ml-input-" + field.id;
    var helpId = inputId + "-help";
    var errorId = inputId + "-error";

    var wrap = document.createElement("div");
    wrap.className = "ml-field";
    wrap.dataset.field = field.id;

    var label = document.createElement("label");
    label.className = "ml-label";
    label.htmlFor = inputId;

    var num = document.createElement("span");
    num.className = "ml-label__num";
    num.setAttribute("aria-hidden", "true");
    num.textContent = i + 1;

    var text = document.createElement("span");
    text.className = "ml-label__text";
    text.textContent = field.label;

    var helper = document.createElement("span");
    helper.className = "ml-label__helper";
    helper.lang = "ur-Latn";
    helper.textContent = field.helper;

    label.append(num, text, helper);

    var input = document.createElement("input");
    input.className = "ml-input";
    input.id = inputId;
    input.name = field.id;
    input.type = "text";
    input.required = true;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 40;
    input.setAttribute("autocapitalize", field.id.indexOf("character") === 0 ? "words" : "off");
    input.setAttribute("enterkeyhint", i === issue.fields.length - 1 ? "done" : "next");
    input.setAttribute("aria-describedby", (field.example ? helpId + " " : "") + errorId);

    wrap.append(label, input);

    if (field.example) {
      var example = document.createElement("p");
      example.className = "ml-example";
      example.id = helpId;
      example.textContent = "e.g. " + field.example;
      wrap.appendChild(example);
    }

    var error = document.createElement("p");
    error.className = "ml-field-error";
    error.id = errorId;
    wrap.appendChild(error);

    input.addEventListener("input", function () {
      if (input.value.trim()) setFieldError(field.id, false);
    });

    // Enter / mobile "next" moves to the following blank; only the last one submits
    var nextField = issue.fields[i + 1];
    if (nextField) {
      input.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        getInput(nextField.id).focus();
      });
    }

    container.appendChild(wrap);
  });
}

function getInput(fieldId) {
  return document.getElementById("ml-input-" + fieldId);
}

function setFieldError(fieldId, hasError) {
  var input = getInput(fieldId);
  var wrap = input.closest(".ml-field");
  var error = document.getElementById("ml-input-" + fieldId + "-error");

  wrap.classList.toggle("ml-field--invalid", hasError);
  input.setAttribute("aria-invalid", hasError ? "true" : "false");
  error.textContent = hasError ? EMPTY_FIELD_MSG : "";

  if (!hasError && !document.querySelector(".ml-field--invalid")) {
    document.getElementById("ml-form-error").textContent = "";
  }
}

// ── Validation + submit ──────────────────────────────────────────────────────
function handleSubmit(event) {
  event.preventDefault();

  var missing = [];
  issue.fields.forEach(function (field) {
    var value = getInput(field.id).value.trim();
    answers[field.id] = value;
    setFieldError(field.id, !value);
    if (!value) missing.push(field.id);
  });

  var formError = document.getElementById("ml-form-error");
  if (missing.length) {
    formError.textContent = missing.length === 1
      ? "Ek blank abhi khaali hai. One blank is still empty."
      : missing.length + " blanks abhi khaali hain. " + missing.length + " blanks are still empty.";
    var first = getInput(missing[0]);
    first.focus({ preventScroll: true });
    first.closest(".ml-field").scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    return;
  }

  formError.textContent = "";
  showResult();
}

// ── Story rendering ──────────────────────────────────────────────────────────
function startsWithVowelSound(word) {
  return /^[aeiou]/i.test(word);
}

function renderStory(container, paragraphs) {
  container.replaceChildren();

  paragraphs.forEach(function (paragraph) {
    var parts = Array.isArray(paragraph) ? paragraph : paragraph.parts;
    var style = Array.isArray(paragraph) ? null : paragraph.style;

    var p = document.createElement("p");
    p.className = "ml-line" + (style ? " ml-line--" + style : "");

    parts.forEach(function (part) {
      if (typeof part === "string") {
        p.appendChild(document.createTextNode(part));
        return;
      }

      var value = answers[part.blank] || "";
      if (part.article) {
        p.appendChild(document.createTextNode(startsWithVowelSound(value) ? "an " : "a "));
      }

      var answer = document.createElement("span");
      answer.className = "ml-answer";
      answer.textContent = value;
      p.appendChild(answer);
    });

    container.appendChild(p);
  });
}

function storyAsPlainText() {
  return Array.prototype.map
    .call(document.querySelectorAll("#ml-story .ml-line"), function (line) { return line.textContent; })
    .join("\n");
}

// ── Screen switching ─────────────────────────────────────────────────────────
function showResult() {
  renderStory(document.getElementById("ml-story"), issue.romanUrdu);
  renderStory(document.getElementById("ml-english-story"), issue.english);
  setTranslationVisible(false);

  document.getElementById("ml-entry").hidden = true;
  document.getElementById("ml-result").hidden = false;

  scrollToTop();
  document.getElementById("ml-story-title").focus({ preventScroll: true });
}

function playAgain() {
  answers = emptyAnswers();
  document.getElementById("ml-form").reset();
  issue.fields.forEach(function (field) { setFieldError(field.id, false); });

  document.getElementById("ml-story").replaceChildren();
  document.getElementById("ml-english-story").replaceChildren();
  setTranslationVisible(false);
  resetCopyButton();

  document.getElementById("ml-result").hidden = true;
  document.getElementById("ml-entry").hidden = false;

  scrollToTop();
  getInput(issue.fields[0].id).focus({ preventScroll: true });
}

function setTranslationVisible(visible) {
  var btn = document.getElementById("ml-translate-btn");
  document.getElementById("ml-english").hidden = !visible;
  btn.setAttribute("aria-expanded", visible ? "true" : "false");
  btn.textContent = visible ? "Hide English Translation" : "Show English Translation";
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollBehavior() {
  return prefersReducedMotion() ? "auto" : "smooth";
}

function scrollToTop() {
  document.getElementById("ml-top").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

// ── Copy ─────────────────────────────────────────────────────────────────────
var copyResetTimer = null;

function copyWithFallback(text) {
  var textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  var ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  textarea.remove();
  return ok;
}

function copyStory() {
  var text = issue.title + "\n\n" + storyAsPlainText() + "\n\n— The Kahani Times · Kahani Korner";

  var copied = navigator.clipboard && window.isSecureContext
    ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return copyWithFallback(text); })
    : Promise.resolve(copyWithFallback(text));

  copied.then(function (ok) {
    var btn = document.getElementById("ml-copy-btn");
    var status = document.getElementById("ml-copy-status");

    btn.textContent = ok ? "Copied!" : "Copy didn't work";
    btn.classList.toggle("ml-btn--copied", ok);
    status.textContent = ok ? "Story copied to clipboard." : "Sorry, the story could not be copied.";

    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(resetCopyButton, COPY_RESET_MS);
  });
}

function resetCopyButton() {
  clearTimeout(copyResetTimer);
  var btn = document.getElementById("ml-copy-btn");
  btn.textContent = "Copy My Story";
  btn.classList.remove("ml-btn--copied");
  document.getElementById("ml-copy-status").textContent = "";
}

// ── Init ─────────────────────────────────────────────────────────────────────
function showUnavailable() {
  document.getElementById("ml-empty").hidden = false;
  document.getElementById("ml-subtitle").hidden = true;
  document.getElementById("ml-subtitle-roman").hidden = true;
}

function init() {
  window.KKIssue.loadGame("madLib").then(function (result) {
    if (!isPlayable(result.game)) {
      window.KKIssue.logFailure("Mad Lib", { reason: "incomplete-game", detail: "games.madLib.game needs fields, romanUrdu and english" });
      showUnavailable();
      return;
    }
    start(result.game);
  }, function (error) {
    window.KKIssue.logFailure("Mad Lib", error);
    showUnavailable();
  });
}

function start(game) {
  issue = game;

  document.getElementById("ml-title").textContent = issue.title;
  document.getElementById("ml-doc-title").textContent = issue.title + " · Urdu Mad Lib | Kahani Korner";
  document.getElementById("ml-blank-count").textContent =
    issue.fields.length + (issue.fields.length === 1 ? " blank" : " blanks");

  answers = emptyAnswers();
  renderFields();

  document.getElementById("ml-form").addEventListener("submit", handleSubmit);
  document.getElementById("ml-translate-btn").addEventListener("click", function () {
    setTranslationVisible(document.getElementById("ml-english").hidden);
  });
  document.getElementById("ml-copy-btn").addEventListener("click", copyStory);
  document.getElementById("ml-replay-btn").addEventListener("click", playAgain);

  document.getElementById("ml-entry").hidden = false;
}

init();
