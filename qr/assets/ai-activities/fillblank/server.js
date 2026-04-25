/**
 * server.js — Kahani Korner Fill-in-the-Blank AI Backend
 * ────────────────────────────────────────────────────────────
 * Location: qr/assets/ai-activities/fillblank/server.js
 *
 * ── Quick Start ──────────────────────────────────────────────
 *   cd qr/assets/ai-activities/fillblank
 *   npm install
 *   npm start
 *
 *   Then open:
 *   http://localhost:3000/qr/assets/html/fillblank.html?words=chaand,raat,roshni
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();
const express = require("express");
const path    = require("path");
const OpenAI  = require("openai");

// ── Validate env ──────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "\n❌  OPENAI_API_KEY is not set.\n" +
    "    Add it to the .env file in this folder.\n"
  );
  process.exit(1);
}

// ── Server setup ──────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the whole repo root so /qr/assets/... paths all resolve.
// This file is 4 levels deep: qr/assets/ai-activities/fillblank/
// so ../../../../ = kahanikorner-code/
app.use(express.static(path.join(__dirname, "../../../..")));

// ── OpenAI client ─────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Prompt engineering ────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are a bilingual Urdu–English language learning assistant for children and beginner learners.

Your ONLY job is to create fill-in-the-blank sentences for vocabulary practice.

STRICT RULES:
1. Respond with ONLY valid JSON — no markdown, no code fences, no explanation, no commentary.
2. Use the target word naturally in the sentence, exactly once if possible.
3. Replace the target word with exactly "_____" (5 underscores) in both blank versions.
4. Keep Roman Urdu (romanFull / romanBlank) phonetically aligned with the Urdu script sentence.
5. The English translation must be natural — not word-for-word literal.
6. Sentences must be child-friendly, encouraging, and culturally appropriate for a South Asian audience.
7. Hard difficulty may use a grammatical variant of the word (e.g. plural, case form) if it sounds natural.

DIFFICULTY GUIDELINES:
  easy   — 5–8 Urdu words, very simple, direct use of base form
  medium — 8–12 Urdu words, slightly richer context, still beginner-accessible
  hard   — 12–18 Urdu words, fuller sentence with context, variant form acceptable

REQUIRED JSON SCHEMA (return exactly these fields, nothing else):
{
  "level": "easy | medium | hard",
  "urduFull":           "complete Urdu sentence including the target word",
  "urduBlank":          "same Urdu sentence with _____ replacing the target word",
  "romanFull":          "complete Roman Urdu transliteration",
  "romanBlank":         "same Roman Urdu with _____ replacing the target word",
  "englishTranslation": "natural English translation of the full sentence",
  "answerUrdu":         "the exact token that was blanked — in Urdu script",
  "answerRoman":        "the exact token that was blanked — in Roman Urdu"
}`;

// To change how sentences are generated, edit only this function.
function buildUserPrompt(word, difficulty) {
  const variantSection =
    Array.isArray(word.variants) && word.variants.length > 0
      ? "\nGrammatical variants (use only if natural for the difficulty):\n" +
        word.variants.map((v) => `  - Urdu: "${v.urdu}"  Roman: "${v.romanUrdu}"`).join("\n")
      : "";

  return (
    `Generate a fill-in-the-blank sentence for the vocabulary word below.\n\n` +
    `Target word:\n` +
    `  Urdu script   : "${word.urdu}"\n` +
    `  Roman Urdu    : "${word.romanUrdu}"\n` +
    `  English       : "${word.english}"\n` +
    `  Part of speech: ${word.pos || "unknown"}\n` +
    `  Gender        : ${word.gender || "unknown"}` +
    variantSection +
    `\n\nDifficulty: ${difficulty}\n\nReturn only the JSON object.`
  );
}

// ── Response helpers ──────────────────────────────────────────

function stripFences(raw) {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function validateSentence(obj) {
  const required = [
    "level","urduFull","urduBlank","romanFull",
    "romanBlank","englishTranslation","answerUrdu","answerRoman",
  ];
  for (const key of required) {
    if (typeof obj[key] !== "string" || !obj[key].trim()) {
      throw new Error(`AI response missing field: "${key}"`);
    }
  }
  if (!obj.urduBlank.includes("_____"))  throw new Error("urduBlank missing _____ placeholder");
  if (!obj.romanBlank.includes("_____")) throw new Error("romanBlank missing _____ placeholder");
}

// ── Route: POST /api/generate-sentence ───────────────────────

app.post("/api/generate-sentence", async (req, res) => {
  const { word, difficulty } = req.body || {};

  if (!word || typeof word !== "object") {
    return res.status(400).json({ success: false, error: 'Request body must include a "word" object.' });
  }

  const missing = ["urdu","romanUrdu","english"].filter(
    (k) => !word[k] || typeof word[k] !== "string"
  );
  if (missing.length) {
    return res.status(400).json({
      success: false,
      error: `"word" is missing required fields: ${missing.join(", ")}`,
    });
  }

  const level = ["easy","medium","hard"].includes(difficulty) ? difficulty : "easy";

  let rawContent = "";
  try {
    const completion = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: buildUserPrompt(word, level) },
      ],
      temperature: 0.7,
      max_tokens:  400,
    });
    rawContent = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[generate-sentence] OpenAI error:", err.message);
    return res.status(502).json({
      success: false,
      error: "Could not reach the AI service. Please try again.",
    });
  }

  try {
    const parsed = JSON.parse(stripFences(rawContent));
    validateSentence(parsed);
    parsed.level = level;
    console.log(`[generate-sentence] ✓  word="${word.romanUrdu}"  difficulty=${level}`);
    return res.json({ success: true, sentence: parsed });
  } catch (err) {
    console.error("[generate-sentence] Parse error:", err.message);
    console.error("[generate-sentence] Raw output:", rawContent);
    return res.status(502).json({
      success: false,
      error: "The AI returned an unexpected response. Please try again.",
    });
  }
});

// ── Catch-all ─────────────────────────────────────────────────
app.get("*", (_req, res) => {
  res.redirect("/qr/assets/html/fillblank.html");
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Kahani Korner — Fill-in-the-Blank AI`);
  console.log(`    http://localhost:${PORT}/qr/assets/html/fillblank.html?words=chaand,raat,roshni`);
  console.log(`    Press Ctrl+C to stop.\n`);
});
