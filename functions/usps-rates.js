// ─────────────────────────────────────────────────────────────────────────────
// Live USPS rating via EasyPost (US destinations only in this phase).
//
// fetchUspsRates() never throws: on any problem (missing key / origin /
// package config, timeout, API error, no approved USPS rate) it resolves to
// { ok: false, reason } and the caller falls back to the fixed shipping rates.
//
// Env (functions/.env — never sent to the browser):
//   EASYPOST_API_KEY
//   SHIP_FROM_NAME, SHIP_FROM_STREET1, SHIP_FROM_STREET2 (optional),
//   SHIP_FROM_CITY, SHIP_FROM_STATE, SHIP_FROM_ZIP, SHIP_FROM_COUNTRY (=US)
//   EASYPOST_USPS_CARRIER_ACCOUNT_ID (optional — limits rating to that account)
// ─────────────────────────────────────────────────────────────────────────────

const { USPS_SERVICES, getRatingParcel } = require("./shipping");

const EASYPOST_TIMEOUT_MS = 8000;

const REQUIRED_ORIGIN_ENV = [
  "SHIP_FROM_NAME",
  "SHIP_FROM_STREET1",
  "SHIP_FROM_CITY",
  "SHIP_FROM_STATE",
  "SHIP_FROM_ZIP",
  "SHIP_FROM_COUNTRY",
];

function defaultCreateClient(apiKey, options) {
  // Required lazily so a missing package degrades to fallback, not a crash.
  const EasyPostClient = require("@easypost/api");
  return new EasyPostClient(apiKey, options);
}

// Can live rating run for this shipment? Checks config only — no API call.
// Returns { ok: true, apiKey, fromAddress, parcel, carrierAccountId } or
// { ok: false, reason }.
function getLiveRatingReadiness(shipmentProfile, env = process.env) {
  const missing = [];
  if (!env.EASYPOST_API_KEY) missing.push("EASYPOST_API_KEY");
  for (const key of REQUIRED_ORIGIN_ENV) {
    if (!env[key]) missing.push(key);
  }

  const { parcel, missing: missingPackage } = getRatingParcel(shipmentProfile);
  if (missingPackage) missing.push(...missingPackage);

  if (missing.length > 0) {
    return { ok: false, reason: `not configured: ${missing.join(", ")}` };
  }

  if (env.SHIP_FROM_COUNTRY.trim().toUpperCase() !== "US") {
    return { ok: false, reason: "SHIP_FROM_COUNTRY must be US" };
  }

  const fromAddress = {
    name: env.SHIP_FROM_NAME,
    street1: env.SHIP_FROM_STREET1,
    city: env.SHIP_FROM_CITY,
    state: env.SHIP_FROM_STATE,
    zip: env.SHIP_FROM_ZIP,
    country: "US",
  };
  if (env.SHIP_FROM_STREET2) fromAddress.street2 = env.SHIP_FROM_STREET2;

  return {
    ok: true,
    apiKey: env.EASYPOST_API_KEY,
    fromAddress,
    parcel,
    carrierAccountId: env.EASYPOST_USPS_CARRIER_ACCOUNT_ID || null,
  };
}

// Trusted EasyPost Shipment.create params. Only the destination country/ZIP
// comes from the customer (already validated by validateDestination).
function buildRatingRequest(readiness, destination) {
  const request = {
    to_address: { zip: destination.postalCode, country: destination.country },
    from_address: readiness.fromAddress,
    parcel: readiness.parcel,
  };
  if (readiness.carrierAccountId) {
    request.carrier_accounts = [readiness.carrierAccountId];
  }
  return request;
}

// EasyPost rates → approved USPS services only, one (cheapest) per service,
// sorted cheapest first:
// { provider, serviceCode, displayName, amountCents, currency, estimatedDays }
function normalizeUspsRates(rawRates) {
  const byService = new Map();

  for (const r of Array.isArray(rawRates) ? rawRates : []) {
    if (!r || String(r.carrier || "").toUpperCase() !== "USPS") continue;
    if (!Object.prototype.hasOwnProperty.call(USPS_SERVICES, r.service)) continue;
    if (String(r.currency || "").toUpperCase() !== "USD") continue;

    const dollars = Number(r.rate);
    if (!Number.isFinite(dollars) || dollars <= 0) continue;

    const normalized = {
      provider: "USPS",
      serviceCode: r.service,
      displayName: USPS_SERVICES[r.service].displayName,
      amountCents: Math.round(dollars * 100),
      currency: "usd",
      estimatedDays:
        Number.isInteger(r.delivery_days) && r.delivery_days > 0
          ? r.delivery_days
          : null,
    };

    const existing = byService.get(r.service);
    if (!existing || normalized.amountCents < existing.amountCents) {
      byService.set(r.service, normalized);
    }
  }

  return [...byService.values()].sort((a, b) => a.amountCents - b.amountCents);
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// → { ok: true, rates } | { ok: false, reason }
async function fetchUspsRates({
  shipmentProfile,
  destination,
  env = process.env,
  createClient = defaultCreateClient,
  timeoutMs = EASYPOST_TIMEOUT_MS,
}) {
  const readiness = getLiveRatingReadiness(shipmentProfile, env);
  if (!readiness.ok) return { ok: false, reason: readiness.reason };

  if (!destination || destination.country !== "US") {
    return { ok: false, reason: "live rating is US-only in this phase" };
  }

  try {
    const client = createClient(readiness.apiKey, { timeout: timeoutMs });
    const shipment = await withTimeout(
      client.Shipment.create(buildRatingRequest(readiness, destination)),
      timeoutMs
    );

    const rates = normalizeUspsRates(shipment && shipment.rates);
    if (rates.length === 0) {
      return { ok: false, reason: "EasyPost returned no approved USPS rates" };
    }

    return { ok: true, rates };
  } catch (err) {
    const message = String((err && err.message) || err).split(readiness.apiKey).join("[redacted]");
    return { ok: false, reason: `EasyPost error: ${message.slice(0, 300)}` };
  }
}

module.exports = {
  EASYPOST_TIMEOUT_MS,
  getLiveRatingReadiness,
  buildRatingRequest,
  normalizeUspsRates,
  fetchUspsRates,
};
