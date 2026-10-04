// Pure-function tests for shipping.js. No Stripe / Firebase calls.
// Run: node --test functions/shipping.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PACKAGE_DIMENSIONS,
  US_SHIPPING_RATES,
  WEIGHT_SHIPPING_RATES,
  US_UNTRACKED_LETTER_RATES,
  calculateShipmentProfile,
  getRatingParcel,
  validateDestination,
  getAvailableShippingServices,
  selectShippingOptions,
} = require("./shipping");

const BOOK = "price_1TbIF6P4FFhr5UNAXn6meNvr";        // Abbu Laye Motor Car, 6 oz
const BOOK_2 = "price_1TbIHDP4FFhr5UNAeyIkRrax";      // Dada Jee Ka Khet, 6 oz
const BUNDLE = "price_1SYLwPP4FFhr5UNAc6JmV0iR";      // All Kahani's Bundle, 24 oz
const COLORING = "price_1TjQGxP4FFhr5UNAMtrY7cJq";    // Mini Coloring Book, 5 oz
const STICKER = "price_1Tb6jbP4FFhr5UNAHcybrHON";     // Oopsie Stickers, 1 oz
const STICKER_2 = "price_1Tb6DjP4FFhr5UNApKWkP5wA";   // Mango Stickers, 1 oz
const STICKER_3 = "price_1SvrPwP4FFhr5UNAhWnlzbu5";   // Stickers 15-pack, 1 oz
const ARCHIVE = "price_test_archive";                 // stands in for the env price ID

const profile = (items) => calculateShipmentProfile(items, ARCHIVE);
const codes = (options) => options.map((o) => o.service);

// Silence the expected server-side log in the unknown-product test.
const quietly = (fn) => {
  const original = console.error;
  console.error = () => {};
  try { return fn(); } finally { console.error = original; }
};

// ── Shipment profile: product weight only, no packaging ─────────────────────

test("profile has no packaging field and total = product weight", () => {
  const p = profile([{ price: STICKER, quantity: 1 }]);
  assert.deepEqual(p, { itemWeightOz: 1, totalWeightOz: 1, shippingClass: "flat", flatEligible: true });
  assert.ok(!("packagingWeightOz" in p));
});

test("6. one 6 oz book → parcel, exactly 6 oz (not 8)", () => {
  assert.deepEqual(profile([{ price: BOOK, quantity: 1 }]), {
    itemWeightOz: 6,
    totalWeightOz: 6,
    shippingClass: "parcel",
    flatEligible: false,
  });
});

test("two 6 oz books → 12 oz parcel", () => {
  const p = profile([{ price: BOOK, quantity: 1 }, { price: BOOK_2, quantity: 1 }]);
  assert.equal(p.totalWeightOz, 12);
  assert.equal(p.shippingClass, "parcel");
});

test("7. All Kahani's Bundle → exactly 24 oz", () => {
  const p = profile([{ price: BUNDLE, quantity: 1 }]);
  assert.equal(p.totalWeightOz, 24);
  assert.equal(p.shippingClass, "parcel");
});

test("quantity multiplies weight: 3 books → 18 oz", () => {
  assert.equal(profile([{ price: BOOK, quantity: 3 }]).totalWeightOz, 18);
});

test("classes: stickers flat; books, coloring book, bundle, archive parcel", () => {
  for (const id of [STICKER, STICKER_2, STICKER_3]) {
    assert.equal(profile([{ price: id, quantity: 1 }]).shippingClass, "flat", id);
  }
  for (const id of [BOOK, BUNDLE, COLORING, ARCHIVE]) {
    assert.equal(profile([{ price: id, quantity: 1 }]).shippingClass, "parcel", id);
  }
});

test("archive editions → 1 oz each, parcel; archive + sticker → parcel", () => {
  const a = profile([{ price: ARCHIVE, quantity: 3 }]);
  assert.equal(a.totalWeightOz, 3);
  assert.equal(a.shippingClass, "parcel");
  assert.equal(profile([{ price: ARCHIVE, quantity: 1 }, { price: STICKER, quantity: 1 }]).shippingClass, "parcel");
});

test("13. unknown product → safe 400 failure, no silent acceptance", () => {
  assert.throws(
    () => quietly(() => profile([{ price: BOOK, quantity: 1 }, { price: "price_unknown_123", quantity: 1 }])),
    (err) => err.statusCode === 400 && /contact us/i.test(err.message)
  );
  // Prototype keys are not treated as products.
  assert.throws(
    () => quietly(() => profile([{ price: "constructor", quantity: 1 }])),
    (err) => err.statusCode === 400
  );
});

// ── US: stamped letter mail for flat-only carts up to 3 oz ──────────────────

test("letter rates are the stamped First-Class letter prices", () => {
  assert.deepEqual(US_UNTRACKED_LETTER_RATES, [
    { maxOz: 1, amountCents: 82 },
    { maxOz: 2, amountCents: 111 },
    { maxOz: 3, amountCents: 140 },
  ]);
});

const usFixed = (items, subtotal) => getAvailableShippingServices(profile(items), "US", subtotal, null);

test("1. one 1 oz sticker → flat, 1 oz, Untracked Letter Mail $0.82 only", () => {
  const p = profile([{ price: STICKER, quantity: 1 }]);
  assert.equal(p.totalWeightOz, 1);
  assert.equal(p.shippingClass, "flat");
  const options = usFixed([{ price: STICKER, quantity: 1 }], 499);
  assert.equal(options.length, 1);
  assert.deepEqual(
    { service: options[0].service, name: options[0].displayName, amount: options[0].amountCents, tracked: options[0].tracked, mode: options[0].mode, rate: options[0].rate },
    { service: "UNTRACKED_LETTER", name: "Untracked Letter Mail", amount: 82, tracked: false, mode: "untracked_letter", rate: undefined }
  );
});

test("2. two different 1 oz sticker products → 2 oz → $1.11", () => {
  const options = usFixed([{ price: STICKER, quantity: 1 }, { price: STICKER_2, quantity: 1 }], 998);
  assert.deepEqual(options.map((o) => [o.service, o.amountCents]), [["UNTRACKED_LETTER", 111]]);
});

test("3. three 1 oz sticker products → 3 oz → $1.40", () => {
  const options = usFixed([{ price: STICKER, quantity: 1 }, { price: STICKER_2, quantity: 1 }, { price: STICKER_3, quantity: 1 }], 1997);
  assert.deepEqual(options.map((o) => [o.service, o.amountCents]), [["UNTRACKED_LETTER", 140]]);
  // Quantity counts too: one product × 3 = 3 oz.
  assert.equal(usFixed([{ price: STICKER, quantity: 3 }], 1497)[0].amountCents, 140);
});

test("4. four 1 oz stickers → no letter mail, normal $4.99 US parcel fallback", () => {
  const options = usFixed([{ price: STICKER, quantity: 4 }], 1996);
  assert.deepEqual(codes(options), ["FIXED_STANDARD"]);
  assert.equal(options[0].rate, US_SHIPPING_RATES.standard);
  assert.equal(options[0].amountCents, 499);
});

test("5. sticker + book → parcel, no letter mail, $4.99 fallback", () => {
  const p = profile([{ price: STICKER, quantity: 1 }, { price: BOOK, quantity: 1 }]);
  assert.equal(p.shippingClass, "parcel");
  assert.equal(p.totalWeightOz, 7);
  const options = usFixed([{ price: STICKER, quantity: 1 }, { price: BOOK, quantity: 1 }], 1798);
  assert.deepEqual(codes(options), ["FIXED_STANDARD"]);
  assert.equal(options[0].amountCents, 499);
});

test("light parcel item (1 oz archive) never gets letter mail", () => {
  assert.deepEqual(codes(usFixed([{ price: ARCHIVE, quantity: 1 }], 500)), ["FIXED_STANDARD"]);
});

test("12. US subtotal >= $65 → free shipping overrides the letter rate", () => {
  const options = usFixed([{ price: STICKER, quantity: 1 }], 6500);
  assert.deepEqual(codes(options), ["FIXED_STANDARD"]);
  assert.equal(options[0].rate, US_SHIPPING_RATES.free);
  assert.equal(options[0].amountCents, 0);
  assert.equal(options[0].freeUsShipping, true);
});

test("US subtotal >= $65 parcel → free shipping preserved", () => {
  for (const subtotal of [6500, 12000]) {
    const options = usFixed([{ price: BUNDLE, quantity: 1 }], subtotal);
    assert.equal(options.length, 1);
    assert.equal(options[0].rate, US_SHIPPING_RATES.free);
  }
});

test("US parcel under $65 → $4.99 standard preserved", () => {
  const options = usFixed([{ price: BOOK, quantity: 1 }], 6499);
  assert.equal(options.length, 1);
  assert.equal(options[0].rate, US_SHIPPING_RATES.standard);
  assert.equal(options[0].freeUsShipping, false);
});

test("US shipping ignores weight for parcels (heavy US order is not rejected)", () => {
  const [option] = usFixed([{ price: BUNDLE, quantity: 5 }], 30000);
  assert.equal(option.rate, US_SHIPPING_RATES.free);
});

// ── Canada / International: product weight only ─────────────────────────────

const tier = (region, items) => getAvailableShippingServices(profile(items), region, 1000)[0];

test("8. Canada 8 oz → $12.99 tier", () => {
  const t = tier("CA", [{ price: BOOK, quantity: 1 }, { price: STICKER, quantity: 2 }]); // 6 + 2
  assert.equal(t.amountCents, 1299);
  assert.equal(t.rate.env, "STRIPE_CA_SHIPPING_8OZ_RATE_ID");
  assert.equal(tier("CA", [{ price: STICKER, quantity: 8 }]).amountCents, 1299);
});

test("9. Canada 9 oz → $14.99 tier", () => {
  assert.equal(tier("CA", [{ price: BOOK, quantity: 1 }, { price: STICKER, quantity: 3 }]).amountCents, 1499);
});

test("10. International 8 oz → $14.99", () => {
  assert.equal(tier("INTL", [{ price: STICKER, quantity: 8 }]).amountCents, 1499);
  assert.equal(tier("INTL", [{ price: BOOK, quantity: 1 }, { price: STICKER, quantity: 2 }]).rate.env, "STRIPE_INTL_SHIPPING_8OZ_RATE_ID");
});

test("11. International 9 oz → $18.99", () => {
  assert.equal(tier("INTL", [{ price: STICKER, quantity: 9 }]).amountCents, 1899);
});

test("Canada / International full tier tables", () => {
  assert.deepEqual(WEIGHT_SHIPPING_RATES.CA.map((t) => [t.maxOz, t.amountCents]), [[8, 1299], [16, 1499], [32, 1899], [48, 2299], [64, 2999]]);
  assert.deepEqual(WEIGHT_SHIPPING_RATES.INTL.map((t) => [t.maxOz, t.amountCents]), [[8, 1499], [16, 1899], [32, 2299], [48, 2999], [64, 3399]]);
  assert.equal(tier("INTL", [{ price: BUNDLE, quantity: 1 }, { price: BOOK, quantity: 1 }, { price: STICKER, quantity: 2 }]).amountCents, 2299); // 32 oz
  assert.equal(tier("INTL", [{ price: BUNDLE, quantity: 1 }, { price: BOOK, quantity: 1 }, { price: STICKER, quantity: 3 }]).amountCents, 2999); // 33 oz
});

test("Canada / International never get letter mail, even 1 oz sticker carts", () => {
  for (const region of ["CA", "INTL"]) {
    const options = getAvailableShippingServices(profile([{ price: STICKER, quantity: 1 }]), region, 499);
    assert.deepEqual(codes(options), ["FIXED_WEIGHT_TIER"]);
    assert.equal(options[0].rate, WEIGHT_SHIPPING_RATES[region][0]);
  }
});

test("over 64 oz to Canada → rejected; exactly 64 oz allowed", () => {
  const over = profile([{ price: BUNDLE, quantity: 2 }, { price: STICKER, quantity: 17 }]); // 65
  assert.throws(
    () => getAvailableShippingServices(over, "CA", 20000),
    (err) => err.statusCode === 400 && /over 4 lb/.test(err.message)
  );
  const atLimit = profile([{ price: BUNDLE, quantity: 2 }, { price: STICKER, quantity: 16 }]); // 64
  assert.equal(getAvailableShippingServices(atLimit, "CA", 20000)[0].amountCents, 2999);
});

test("over 64 oz international → rejected", () => {
  const p = profile([{ price: BOOK, quantity: 11 }]); // 66
  assert.throws(
    () => getAvailableShippingServices(p, "INTL", 20000),
    (err) => err.statusCode === 400 && /over 4 lb/.test(err.message)
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Live USPS options, letter mail, free shipping, selection, destinations
// ─────────────────────────────────────────────────────────────────────────────

// Normalized live rates as usps-rates.js returns them.
const LIVE = [
  { provider: "USPS", serviceCode: "GroundAdvantage", displayName: "USPS Ground Advantage", amountCents: 582, currency: "usd", estimatedDays: 4 },
  { provider: "USPS", serviceCode: "Priority", displayName: "USPS Priority Mail", amountCents: 1040, currency: "usd", estimatedDays: 2 },
  { provider: "USPS", serviceCode: "Express", displayName: "USPS Priority Mail Express", amountCents: 3150, currency: "usd", estimatedDays: 1 },
];

test("live US parcel → Ground Advantage / Priority / Express at quoted prices", () => {
  const options = getAvailableShippingServices(profile([{ price: BOOK, quantity: 1 }]), "US", 1299, LIVE);
  assert.deepEqual(codes(options), ["GroundAdvantage", "Priority", "Express"]);
  assert.deepEqual(options.map((o) => o.amountCents), [582, 1040, 3150]);
  assert.ok(options.every((o) => o.mode === "live_usps" && o.tracked === true && !o.rate));
  assert.deepEqual(options[0].deliveryEstimate, { minBusinessDays: 2, maxBusinessDays: 5 });
});

test("live US + letter-eligible flat cart → letter mail beside the live USPS services", () => {
  const options = getAvailableShippingServices(profile([{ price: STICKER, quantity: 2 }]), "US", 998, LIVE);
  assert.deepEqual(codes(options), ["UNTRACKED_LETTER", "GroundAdvantage", "Priority", "Express"]);
  assert.equal(options[0].amountCents, 111);
});

test("live US + sticker + book → live services only, no letter mail", () => {
  const options = getAvailableShippingServices(profile([{ price: STICKER, quantity: 1 }, { price: BOOK, quantity: 1 }]), "US", 1798, LIVE);
  assert.deepEqual(codes(options), ["GroundAdvantage", "Priority", "Express"]);
});

test("US $65+ live → cheapest tracked service is $0, Priority / Express stay paid", () => {
  const options = getAvailableShippingServices(profile([{ price: BUNDLE, quantity: 1 }]), "US", 6999, LIVE);
  const byCode = Object.fromEntries(options.map((o) => [o.service, o]));
  assert.equal(byCode.GroundAdvantage.amountCents, 0);
  assert.equal(byCode.GroundAdvantage.freeUsShipping, true);
  assert.equal(byCode.GroundAdvantage.quotedAmountCents, 582);
  assert.equal(byCode.Priority.amountCents, 1040);
  assert.equal(byCode.Priority.freeUsShipping, false);
  assert.equal(byCode.Express.amountCents, 3150);
});

test("US $65+ flat cart → free Ground Advantage, no letter postage charged", () => {
  const options = getAvailableShippingServices(profile([{ price: STICKER, quantity: 1 }]), "US", 6500, LIVE);
  assert.deepEqual(codes(options), ["GroundAdvantage", "Priority", "Express"]);
  assert.equal(options[0].amountCents, 0);
});

test("free rule picks the cheapest tracked service, whatever its name", () => {
  const odd = [
    { ...LIVE[1], amountCents: 900 },
    { ...LIVE[0], amountCents: 950 },
  ];
  const options = getAvailableShippingServices(profile([{ price: BUNDLE, quantity: 1 }]), "US", 6999, odd);
  assert.equal(options.find((o) => o.service === "Priority").amountCents, 0);
  assert.equal(options.find((o) => o.service === "GroundAdvantage").amountCents, 950);
});

test("selectShippingOptions: chosen service only, at the server's price", () => {
  const options = getAvailableShippingServices(profile([{ price: BOOK, quantity: 1 }]), "US", 1299, LIVE);
  const [chosen] = selectShippingOptions(options, "Priority");
  assert.equal(chosen.service, "Priority");
  assert.equal(chosen.amountCents, 1040);
  assert.equal(selectShippingOptions(options, undefined).length, 3);
});

test("selectShippingOptions: unavailable service → refresh error", () => {
  const options = getAvailableShippingServices(profile([{ price: BOOK, quantity: 1 }]), "US", 1299, LIVE);
  for (const bad of ["UNTRACKED_LETTER", "FIXED_STANDARD", "FedExGround", 42, "x".repeat(100)]) {
    assert.throws(
      () => selectShippingOptions(options, bad),
      (err) => err.statusCode === 400 && /refresh shipping options/.test(err.message)
    );
  }
});

test("selectShippingOptions: live service picked while live rating is down → fixed fallback", () => {
  const fallback = getAvailableShippingServices(profile([{ price: BOOK, quantity: 1 }]), "US", 1299, null);
  const [option] = selectShippingOptions(fallback, "Priority");
  assert.equal(option.service, "FIXED_STANDARD");
  assert.equal(option.rate, US_SHIPPING_RATES.standard);
});

test("validateDestination: normalizes valid input per region", () => {
  assert.equal(validateDestination("US", undefined), null);
  assert.deepEqual(validateDestination("US", { country: "us", postalCode: " 75035-1234 " }), { country: "US", postalCode: "75035" });
  assert.deepEqual(validateDestination("CA", { country: "CA", postalCode: "k1a0b1" }), { country: "CA", postalCode: "K1A 0B1" });
  assert.deepEqual(validateDestination("INTL", { country: "GB", postalCode: "SW1A 1AA" }), { country: "GB", postalCode: "SW1A 1AA" });
  assert.deepEqual(validateDestination("INTL", { country: "AE", postalCode: "" }), { country: "AE", postalCode: "" });
});

test("validateDestination: region / country mismatch rejected", () => {
  const cases = [
    ["US", { country: "CA", postalCode: "K1A 0B1" }],
    ["CA", { country: "US", postalCode: "75035" }],
    ["INTL", { country: "US", postalCode: "75035" }],
    ["INTL", { country: "CA", postalCode: "K1A 0B1" }],
  ];
  for (const [region, dest] of cases) {
    assert.throws(() => validateDestination(region, dest), (err) => err.statusCode === 400, `${region} ${dest.country}`);
  }
});

test("validateDestination: malformed postal code / country rejected", () => {
  const cases = [
    ["US", { country: "US", postalCode: "7503" }],
    ["US", { country: "US", postalCode: "ABCDE" }],
    ["US", { country: "US" }],
    ["US", { country: "USA", postalCode: "75035" }],
    ["CA", { country: "CA", postalCode: "12345" }],
    ["INTL", { country: "XX", postalCode: "1234" }],
    ["INTL", { country: "GB", postalCode: "<script>" }],
    ["INTL", { country: "GB", postalCode: "1".repeat(40) }],
    ["US", "75035"],
    ["US", ["US", "75035"]],
    ["US", { country: 1, postalCode: 75035 }],
  ];
  for (const [region, dest] of cases) {
    assert.throws(() => validateDestination(region, dest), (err) => err.statusCode === 400, JSON.stringify(dest));
  }
});

test("package dimensions are unconfigured by default (no invented sizes)", () => {
  for (const cls of ["flat", "parcel"]) {
    const { parcel, missing } = getRatingParcel({ shippingClass: cls, totalWeightOz: 8 });
    assert.equal(parcel, undefined);
    assert.equal(missing.length, 3);
  }
});

test("rating parcel uses product weight only (no packaging) and configured dims", () => {
  const saved = { ...PACKAGE_DIMENSIONS.parcel };
  Object.assign(PACKAGE_DIMENSIONS.parcel, { lengthIn: 10, widthIn: 8, heightIn: 1 });
  try {
    const p = profile([{ price: BOOK, quantity: 3 }]); // 18 oz, nothing added
    assert.deepEqual(getRatingParcel(p).parcel, { weight: 18, length: 10, width: 8, height: 1 });
  } finally {
    Object.assign(PACKAGE_DIMENSIONS.parcel, saved);
  }
});
