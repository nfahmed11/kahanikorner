// ─────────────────────────────────────────────────────────────────────────────
// Checkout shipping — trusted configuration and pure calculation helpers.
//
// Everything here is derived from server-side config only. The browser sends
// Stripe price IDs, quantities and a shipping region; it never supplies
// weight, shipping class, shipping cost or free-shipping eligibility.
//
// assets/cart.js keeps a display-only copy of the weights and rate tables so
// the cart can show shipping instantly; shipping.test.js fails if the two
// copies drift apart. This file is the authority — checkout always re-prices
// here. Run the tests with:
//   node --test functions/shipping.test.js
// ─────────────────────────────────────────────────────────────────────────────

// ── Shipping classes ─────────────────────────────────────────────────────────
// flat:   can go as untracked letter mail, but only if EVERY item in the cart
//         is flat.
// parcel: needs parcel shipping. One parcel item makes the whole shipment a
//         parcel.
const SHIPPING_CLASS = {
  FLAT: "flat",
  PARCEL: "parcel",
};

// Trusted per-unit shipping data, keyed by Stripe price ID. Shipping weight is
// the sum of these weights × quantity — no packaging weight is added.
// Only products marked flat can ever go as stamped letter mail.
// A product missing from this map cannot be checked out online.
const PRODUCT_SHIPPING_DATA = {
  price_1SYLwPP4FFhr5UNAc6JmV0iR: { weightOz: 24, shippingClass: SHIPPING_CLASS.PARCEL }, // All Kahani's Bundle (4 books)
  price_1TbIF6P4FFhr5UNAXn6meNvr: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Abbu Laye Motor Car
  price_1TbIHDP4FFhr5UNAeyIkRrax: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Dada Jee Ka Khet
  price_1TbIIEP4FFhr5UNAaJeT8y6Y: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Chuchu Chacha
  price_1TbIGJP4FFhr5UNAeGEVz0Ko: { weightOz: 6,  shippingClass: SHIPPING_CLASS.PARCEL }, // Aaloo Miyan
  price_1Tb6jbP4FFhr5UNAHcybrHON: { weightOz: 1,  shippingClass: SHIPPING_CLASS.FLAT },   // Oopsie Stickers
  price_1Tb6DjP4FFhr5UNApKWkP5wA: { weightOz: 1,  shippingClass: SHIPPING_CLASS.FLAT },   // Pakistani Mango Stickers
  price_1SvrPwP4FFhr5UNAhWnlzbu5: { weightOz: 1,  shippingClass: SHIPPING_CLASS.FLAT },   // Stickers (15-pack)
  price_1TjQGxP4FFhr5UNAMtrY7cJq: { weightOz: 5,  shippingClass: SHIPPING_CLASS.PARCEL }, // Pakistani Food Mini Coloring Book
};

// Kahani Times Archive is priced per edition via STRIPE_KAHANI_TIMES_ARCHIVE_PRICE_ID
// (an env var, so it can't be a literal key above). Treated as parcel:
// editions ship together in a protective sleeve, not as a letter.
const ARCHIVE_SHIPPING_DATA = {
  weightOz: 1,
  shippingClass: SHIPPING_CLASS.PARCEL,
};

// ── Destinations (Stripe Checkout collects the full address) ─────────────────

const US_SHIPPING_COUNTRIES = ["US"];
const CA_SHIPPING_COUNTRIES = ["CA"];

const INTL_SHIPPING_COUNTRIES = (
  "AC AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ " +
  "BR BS BT BV BW BY BZ CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC " +
  "EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB " +
  "LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU " +
  "RW SA SB SC SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TA TC TD TF TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG UY UZ VA VC VE VG VN VU WF WS XK YE YT ZA ZM ZW ZZ"
).split(" ");

// ── Rates ────────────────────────────────────────────────────────────────────

const FREE_US_SHIPPING_THRESHOLD_CENTS = 6500;

// Free US shipping ($65+ subtotal) uses this Stripe shipping-rate object;
// index.js verifies it is an active $0 USD fixed-amount rate.
const US_FREE_SHIPPING_RATE = { env: "STRIPE_US_FREE_SHIPPING_RATE_ID", amountCents: 0 };

// US parcel rates in cents, by billable whole pound (index = pounds, 1–70).
// Billable pounds = total product weight rounded UP to the next whole pound.
const US_WEIGHT_RATES_CENTS = [
  null, // 0 lb is never looked up
  439, 513, 586, 660, 734, 808, 881, 955, 1029, 1102,              // 1–10 lb
  1176, 1250, 1323, 1397, 1471, 1544, 1618, 1692, 1765, 1839,      // 11–20 lb
  1913, 1986, 2060, 2134, 2207, 2281, 2355, 2429, 2502, 2576,      // 21–30 lb
  2650, 2723, 2797, 2871, 2944, 3018, 3092, 3165, 3239, 3313,      // 31–40 lb
  3386, 3460, 3534, 3607, 3681, 3755, 3828, 3902, 3976, 4049,      // 41–50 lb
  4123, 4197, 4271, 4344, 4418, 4492, 4565, 4639, 4713, 4786,      // 51–60 lb
  4860, 4934, 5007, 5081, 5155, 5228, 5302, 5376, 5449, 5523,      // 61–70 lb
];
const US_MAX_WEIGHT_LB = US_WEIGHT_RATES_CENTS.length - 1; // 70

// Untracked US letter mail for sticker-only (all-flat) orders up to 6 oz:
// $0.82 first ounce + $0.29 each additional ounce. Heavier or mixed orders
// use the pound table. US-only on purpose: stickers sent to Canada / abroad
// are merchandise and need a customs-capable package service.
const US_UNTRACKED_LETTER_RATES = [
  { maxOz: 1, amountCents: 82 },
  { maxOz: 2, amountCents: 111 },
  { maxOz: 3, amountCents: 140 },
  { maxOz: 4, amountCents: 169 },
  { maxOz: 5, amountCents: 198 },
  { maxOz: 6, amountCents: 227 },
];

// Canada / International: Stripe shipping-rate objects by total product weight.
// 8 / 16 / 32 / 48 / 64 oz = 0.5 / 1 / 2 / 3 / 4 lb.
const WEIGHT_SHIPPING_RATES = {
  CA: [
    { maxOz: 8,  env: "STRIPE_CA_SHIPPING_8OZ_RATE_ID",  amountCents: 1299 },
    { maxOz: 16, env: "STRIPE_CA_SHIPPING_16OZ_RATE_ID", amountCents: 1499 },
    { maxOz: 32, env: "STRIPE_CA_SHIPPING_32OZ_RATE_ID", amountCents: 1899 },
    { maxOz: 48, env: "STRIPE_CA_SHIPPING_48OZ_RATE_ID", amountCents: 2299 },
    { maxOz: 64, env: "STRIPE_CA_SHIPPING_64OZ_RATE_ID", amountCents: 2999 },
  ],
  INTL: [
    { maxOz: 8,  env: "STRIPE_INTL_SHIPPING_8OZ_RATE_ID",  amountCents: 1499 },
    { maxOz: 16, env: "STRIPE_INTL_SHIPPING_16OZ_RATE_ID", amountCents: 1899 },
    { maxOz: 32, env: "STRIPE_INTL_SHIPPING_32OZ_RATE_ID", amountCents: 2299 },
    { maxOz: 48, env: "STRIPE_INTL_SHIPPING_48OZ_RATE_ID", amountCents: 2999 },
    { maxOz: 64, env: "STRIPE_INTL_SHIPPING_64OZ_RATE_ID", amountCents: 3399 },
  ],
};

// Recorded in Stripe metadata as shipping_mode.
const SHIPPING_MODE = {
  US_WEIGHT_TABLE: "us_weight_table",
  US_FREE: "us_free",
  UNTRACKED_LETTER: "untracked_letter",
  WEIGHT_TIER: "weight_tier",
};

// ── Errors ───────────────────────────────────────────────────────────────────

function checkoutError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ── Shipment profile ─────────────────────────────────────────────────────────

// Trusted shipping data for one Stripe price ID, or null when not configured.
function getShippingProductData(priceId, archivePriceId) {
  if (archivePriceId && priceId === archivePriceId) {
    return ARCHIVE_SHIPPING_DATA;
  }

  return Object.prototype.hasOwnProperty.call(PRODUCT_SHIPPING_DATA, priceId)
    ? PRODUCT_SHIPPING_DATA[priceId]
    : null;
}

// lineItems: [{ price, quantity }] as sent to Stripe (quantity already validated).
// Throws a customer-safe 400 if any product has no trusted shipping data.
function calculateShipmentProfile(lineItems, archivePriceId) {
  let totalWeightOz = 0;
  let hasParcelItem = false;
  const unknown = [];

  for (const li of lineItems) {
    const data = getShippingProductData(li.price, archivePriceId);

    if (!data) {
      unknown.push(li.price);
      continue;
    }

    totalWeightOz += data.weightOz * li.quantity;
    if (data.shippingClass !== SHIPPING_CLASS.FLAT) hasParcelItem = true;
  }

  if (unknown.length > 0) {
    console.error(
      `[shipping] No shipping data on file for: ${unknown.join(", ")}`
    );

    throw checkoutError(
      "Some items in your order can't be shipped online yet. Please contact us to place this order.",
      400
    );
  }

  const shippingClass = hasParcelItem
    ? SHIPPING_CLASS.PARCEL
    : SHIPPING_CLASS.FLAT;

  return {
    totalWeightOz,
    shippingClass,
    flatEligible: shippingClass === SHIPPING_CLASS.FLAT,
  };
}

// ── US rates ─────────────────────────────────────────────────────────────────

// Total weight in pounds → billable whole pounds (always ≥ 1). Rounded to 4
// decimals first so float noise (e.g. 0.1 × 10 = 1.0000000000000002) can't
// push an exact pound up a tier.
function getBillablePounds(totalWeightLb) {
  return Math.max(1, Math.ceil(Math.round(totalWeightLb * 10000) / 10000));
}

// US parcel rate in cents for a total weight in pounds; 400 over 70 lb.
function getUSShippingRateCents(totalWeightLb) {
  const pounds = getBillablePounds(totalWeightLb);

  if (pounds > US_MAX_WEIGHT_LB) {
    throw checkoutError(
      "Please contact us for shipping on orders over 70 lb.",
      400
    );
  }

  return US_WEIGHT_RATES_CENTS[pounds];
}

// Letter postage in cents for an all-flat US shipment, or null if ineligible.
function getUSLetterRateCents(shipmentProfile) {
  if (!shipmentProfile.flatEligible) return null;
  const tier = US_UNTRACKED_LETTER_RATES.find(
    (t) => shipmentProfile.totalWeightOz <= t.maxOz
  );
  return tier ? tier.amountCents : null;
}

// ── Shipping option ──────────────────────────────────────────────────────────

function getWeightTierRate(region, totalWeightOz) {
  const rate = WEIGHT_SHIPPING_RATES[region].find(
    (tier) => totalWeightOz <= tier.maxOz
  );

  if (!rate) {
    throw checkoutError(
      "Orders over 4 lb can't be shipped to Canada or internationally online yet. Please contact us to place this order.",
      400
    );
  }

  return rate;
}

// The single shipping option for this order:
//   { mode, displayName, amountCents, rate? }
// `rate` (a Stripe shipping-rate config) is set for options backed by a
// pre-made Stripe rate (free US, Canada / International tiers); otherwise
// index.js sends trusted shipping_rate_data with amountCents.
//
// US order of precedence:
//   over 70 lb            → 400, contact us
//   subtotal ≥ $65        → free
//   all flat, ≤ 6 oz      → Untracked Letter Mail
//   otherwise             → pound table
function getShippingOption(shipmentProfile, region, subtotalCents) {
  if (region === "US") {
    const parcelCents = getUSShippingRateCents(shipmentProfile.totalWeightOz / 16);

    if (subtotalCents >= FREE_US_SHIPPING_THRESHOLD_CENTS) {
      return {
        mode: SHIPPING_MODE.US_FREE,
        displayName: "Free US Shipping",
        amountCents: 0,
        rate: US_FREE_SHIPPING_RATE,
      };
    }

    const letterCents = getUSLetterRateCents(shipmentProfile);
    if (letterCents !== null) {
      return {
        mode: SHIPPING_MODE.UNTRACKED_LETTER,
        displayName: "Untracked Letter Mail",
        amountCents: letterCents,
      };
    }

    return {
      mode: SHIPPING_MODE.US_WEIGHT_TABLE,
      displayName: "US Shipping",
      amountCents: parcelCents,
    };
  }

  // Canada / International: fixed weight tiers (no letter mail — merchandise
  // needs a customs-capable package service).
  const rate = getWeightTierRate(region, shipmentProfile.totalWeightOz);
  return {
    mode: SHIPPING_MODE.WEIGHT_TIER,
    displayName: region === "CA" ? "Canada Shipping" : "International Shipping",
    amountCents: rate.amountCents,
    rate,
  };
}

module.exports = {
  SHIPPING_CLASS,
  PRODUCT_SHIPPING_DATA,
  ARCHIVE_SHIPPING_DATA,
  US_SHIPPING_COUNTRIES,
  CA_SHIPPING_COUNTRIES,
  INTL_SHIPPING_COUNTRIES,
  FREE_US_SHIPPING_THRESHOLD_CENTS,
  US_FREE_SHIPPING_RATE,
  US_WEIGHT_RATES_CENTS,
  US_MAX_WEIGHT_LB,
  US_UNTRACKED_LETTER_RATES,
  WEIGHT_SHIPPING_RATES,
  SHIPPING_MODE,
  checkoutError,
  getShippingProductData,
  calculateShipmentProfile,
  getBillablePounds,
  getUSShippingRateCents,
  getUSLetterRateCents,
  getShippingOption,
};
