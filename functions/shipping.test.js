// Pure-function tests for shipping.js, plus a check that the display-only copy
// in assets/cart.js matches it. No Stripe / Firebase calls.
// Run: node --test functions/shipping.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const {
  PRODUCT_SHIPPING_DATA,
  ARCHIVE_SHIPPING_DATA,
  FREE_US_SHIPPING_THRESHOLD_CENTS,
  US_FREE_SHIPPING_RATE,
  US_WEIGHT_RATES_CENTS,
  US_UNTRACKED_LETTER_RATES,
  WEIGHT_SHIPPING_RATES,
  calculateShipmentProfile,
  getBillablePounds,
  getUSShippingRateCents,
  getShippingOption,
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
const usOption = (items, subtotal = 1000) => getShippingOption(profile(items), "US", subtotal);

// Silence the expected server-side log in the unknown-product test.
const quietly = (fn) => {
  const original = console.error;
  console.error = () => {};
  try { return fn(); } finally { console.error = original; }
};

// ── Shipment profile ─────────────────────────────────────────────────────────

test("profile: product weight × quantity only", () => {
  assert.deepEqual(profile([{ price: BOOK, quantity: 1 }]), { totalWeightOz: 6, shippingClass: "parcel", flatEligible: false });
  assert.equal(profile([{ price: BUNDLE, quantity: 1 }]).totalWeightOz, 24);
  assert.equal(profile([{ price: BOOK, quantity: 3 }]).totalWeightOz, 18);
  assert.equal(profile([{ price: BOOK, quantity: 1 }, { price: BOOK_2, quantity: 1 }]).totalWeightOz, 12);
});

test("profile: stickers flat; books, coloring book, bundle, archive parcel", () => {
  for (const id of [STICKER, STICKER_2, STICKER_3]) {
    assert.equal(profile([{ price: id, quantity: 1 }]).shippingClass, "flat", id);
  }
  for (const id of [BOOK, BUNDLE, COLORING, ARCHIVE]) {
    assert.equal(profile([{ price: id, quantity: 1 }]).shippingClass, "parcel", id);
  }
  assert.equal(profile([{ price: STICKER, quantity: 1 }, { price: BOOK, quantity: 1 }]).shippingClass, "parcel");
  assert.equal(profile([{ price: ARCHIVE, quantity: 3 }]).totalWeightOz, 3);
});

test("unknown product → safe 400, no silent acceptance", () => {
  assert.throws(
    () => quietly(() => profile([{ price: BOOK, quantity: 1 }, { price: "price_unknown_123", quantity: 1 }])),
    (err) => err.statusCode === 400 && /contact us/i.test(err.message)
  );
  assert.throws(
    () => quietly(() => profile([{ price: "constructor", quantity: 1 }])),
    (err) => err.statusCode === 400
  );
});

// ── US pound table ───────────────────────────────────────────────────────────

test("US rate table matches the published table exactly (1–70 lb)", () => {
  const dollars = [
    4.39, 5.13, 5.86, 6.60, 7.34, 8.08, 8.81, 9.55, 10.29, 11.02,
    11.76, 12.50, 13.23, 13.97, 14.71, 15.44, 16.18, 16.92, 17.65, 18.39,
    19.13, 19.86, 20.60, 21.34, 22.07, 22.81, 23.55, 24.29, 25.02, 25.76,
    26.50, 27.23, 27.97, 28.71, 29.44, 30.18, 30.92, 31.65, 32.39, 33.13,
    33.86, 34.60, 35.34, 36.07, 36.81, 37.55, 38.28, 39.02, 39.76, 40.49,
    41.23, 41.97, 42.71, 43.44, 44.18, 44.92, 45.65, 46.39, 47.13, 47.86,
    48.60, 49.34, 50.07, 50.81, 51.55, 52.28, 53.02, 53.76, 54.49, 55.23,
  ];
  assert.equal(US_WEIGHT_RATES_CENTS.length, 71);
  assert.equal(US_WEIGHT_RATES_CENTS[0], null);
  dollars.forEach((d, i) => assert.equal(US_WEIGHT_RATES_CENTS[i + 1], Math.round(d * 100), `${i + 1} lb`));
});

test("US weight → rate, rounding up to the next whole pound", () => {
  const cases = [
    [0.01, 439], [0.2, 439], [0.5, 439], [0.95, 439], [1.0, 439], [1.01, 513],
    [2.0, 513], [2.01, 586], [2.4, 586], [4.01, 734], [5.0, 734], [5.01, 808],
    [10.0, 1102], [10.01, 1176], [20.0, 1839], [45.0, 3681], [45.01, 3755],
    [69.1, 5523], [70.0, 5523],
  ];
  for (const [lb, cents] of cases) {
    assert.equal(getUSShippingRateCents(lb), cents, `${lb} lb`);
  }
});

test("never a 0 lb lookup; float noise can't bump an exact pound", () => {
  assert.equal(getBillablePounds(0), 1);
  assert.equal(getBillablePounds(0.1 * 10), 1); // 1.0000000000000002
  assert.equal(getBillablePounds(16 / 16), 1);
  assert.equal(getBillablePounds(17 / 16), 2);
});

test("70.01 lb → over-70 handling (400, contact us, no invented rate)", () => {
  for (const lb of [70.01, 71, 500]) {
    assert.throws(
      () => getUSShippingRateCents(lb),
      (err) => err.statusCode === 400 && /contact us for shipping on orders over 70 lb/.test(err.message),
      `${lb} lb`
    );
  }
});

test("quantity: 0.6 lb item × 1 / 2 / 3 / 4 → $4.39 / $5.13 / $5.13 / $5.86", () => {
  assert.deepEqual([1, 2, 3, 4].map((q) => getUSShippingRateCents(0.6 * q)), [439, 513, 513, 586]);
});

test("US parcel orders use the pound table from ounces", () => {
  const book = usOption([{ price: BOOK, quantity: 1 }]); // 6 oz → 1 lb
  assert.deepEqual({ mode: book.mode, name: book.displayName, cents: book.amountCents, rate: book.rate },
    { mode: "us_weight_table", name: "US Shipping", cents: 439, rate: undefined });
  assert.equal(usOption([{ price: BOOK, quantity: 3 }]).amountCents, 513);          // 18 oz → 2 lb
  assert.equal(usOption([{ price: BUNDLE, quantity: 1 }], 6200).amountCents, 513);  // 24 oz → 2 lb
  assert.equal(usOption([{ price: BOOK, quantity: 8 }]).amountCents, 586);          // 48 oz → 3 lb
  assert.equal(usOption([{ price: BOOK, quantity: 16 }]).amountCents, 808);         // 96 oz → exactly 6 lb
  assert.equal(usOption([{ price: BOOK, quantity: 17 }]).amountCents, 881);         // 102 oz → 7 lb
});

test("US over 70 lb is rejected even when free shipping applies", () => {
  const heavy = [{ price: BUNDLE, quantity: 47 }]; // 1128 oz = 70.5 lb
  assert.throws(() => usOption(heavy, 300000), (err) => err.statusCode === 400 && /over 70 lb/.test(err.message));
  assert.equal(usOption([{ price: BUNDLE, quantity: 46 }], 300000).amountCents, 0); // 69 lb, free
});

// ── US letter mail and free shipping ─────────────────────────────────────────

test("letter rates: $0.82 + $0.29 per extra ounce, up to 6 oz", () => {
  assert.deepEqual(US_UNTRACKED_LETTER_RATES.map((t) => [t.maxOz, t.amountCents]),
    [[1, 82], [2, 111], [3, 140], [4, 169], [5, 198], [6, 227]]);
});

test("sticker-only US carts 1–6 oz → Untracked Letter Mail", () => {
  for (const [oz, cents] of [[1, 82], [2, 111], [3, 140], [4, 169], [5, 198], [6, 227]]) {
    const o = usOption([{ price: STICKER, quantity: oz }], 499 * oz);
    assert.deepEqual([o.mode, o.displayName, o.amountCents, o.rate], ["untracked_letter", "Untracked Letter Mail", cents, undefined], `${oz} oz`);
  }
  const mixed = usOption([{ price: STICKER, quantity: 1 }, { price: STICKER_2, quantity: 1 }, { price: STICKER_3, quantity: 1 }]);
  assert.equal(mixed.amountCents, 140);
});

test("7 oz sticker cart → pound table, not letter mail", () => {
  const o = usOption([{ price: STICKER, quantity: 7 }], 3493);
  assert.deepEqual([o.mode, o.amountCents], ["us_weight_table", 439]);
});

test("sticker + book / light archive → pound table, never letter mail", () => {
  assert.equal(usOption([{ price: STICKER, quantity: 1 }, { price: BOOK, quantity: 1 }]).mode, "us_weight_table");
  assert.equal(usOption([{ price: ARCHIVE, quantity: 1 }]).mode, "us_weight_table");
});

test("US $65+ → free (Stripe free rate), overriding both letter and table rates", () => {
  for (const items of [[{ price: STICKER, quantity: 1 }], [{ price: BUNDLE, quantity: 2 }]]) {
    const o = usOption(items, FREE_US_SHIPPING_THRESHOLD_CENTS);
    assert.deepEqual([o.mode, o.amountCents, o.rate], ["us_free", 0, US_FREE_SHIPPING_RATE]);
  }
  assert.equal(usOption([{ price: BUNDLE, quantity: 1 }], 6499).amountCents, 513);
});

// ── Canada / International ───────────────────────────────────────────────────

const tier = (region, items) => getShippingOption(profile(items), region, 1000);

test("Canada tiers by product weight (8 oz → $12.99, 9 oz → $14.99)", () => {
  assert.equal(tier("CA", [{ price: STICKER, quantity: 8 }]).amountCents, 1299);
  assert.equal(tier("CA", [{ price: STICKER, quantity: 9 }]).amountCents, 1499);
  assert.equal(tier("CA", [{ price: BOOK, quantity: 1 }]).rate.env, "STRIPE_CA_SHIPPING_8OZ_RATE_ID");
  assert.deepEqual(WEIGHT_SHIPPING_RATES.CA.map((t) => [t.maxOz, t.amountCents]), [[8, 1299], [16, 1499], [32, 1899], [48, 2299], [64, 2999]]);
});

test("International tiers by product weight (8 oz → $14.99, 9 oz → $18.99)", () => {
  assert.equal(tier("INTL", [{ price: STICKER, quantity: 8 }]).amountCents, 1499);
  assert.equal(tier("INTL", [{ price: STICKER, quantity: 9 }]).amountCents, 1899);
  assert.deepEqual(WEIGHT_SHIPPING_RATES.INTL.map((t) => [t.maxOz, t.amountCents]), [[8, 1499], [16, 1899], [32, 2299], [48, 2999], [64, 3399]]);
});

test("Canada / International never use letter mail or the US pound table", () => {
  for (const region of ["CA", "INTL"]) {
    const o = tier(region, [{ price: STICKER, quantity: 1 }]);
    assert.equal(o.mode, "weight_tier");
    assert.equal(o.rate, WEIGHT_SHIPPING_RATES[region][0]);
  }
});

test("Canada / International over 64 oz → rejected; exactly 64 oz allowed", () => {
  for (const region of ["CA", "INTL"]) {
    assert.equal(tier(region, [{ price: BUNDLE, quantity: 2 }, { price: STICKER, quantity: 16 }]).rate.maxOz, 64);
    assert.throws(
      () => tier(region, [{ price: BUNDLE, quantity: 2 }, { price: STICKER, quantity: 17 }]),
      (err) => err.statusCode === 400 && /over 4 lb/.test(err.message)
    );
  }
});

// ── assets/cart.js display copy stays in sync ────────────────────────────────

// Runs the real cart.js in a sandbox with a minimal DOM / storage stub.
function loadCartJs() {
  const store = {};
  const context = {
    console,
    alert: () => {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: {
      readyState: "complete",
      getElementById: () => null,
      addEventListener: () => {},
    },
    addEventListener: () => {},
    setTimeout,
  };
  context.window = context;
  const code = fs.readFileSync(path.join(__dirname, "..", "assets", "cart.js"), "utf8");
  vm.runInNewContext(`${code}\n;this.__cart = { SHIPPING_TABLES, estimateCartShipping };`, context);
  return context.__cart;
}

test("cart.js tables match shipping.js", () => {
  const { SHIPPING_TABLES: t } = loadCartJs();
  assert.equal(t.freeUsThresholdCents, FREE_US_SHIPPING_THRESHOLD_CENTS);
  assert.deepEqual(
    JSON.parse(JSON.stringify(t.products)),
    Object.fromEntries(Object.entries(PRODUCT_SHIPPING_DATA).map(([id, d]) => [id, [d.weightOz, d.shippingClass]]))
  );
  assert.equal(t.archiveEditionWeightOz, ARCHIVE_SHIPPING_DATA.weightOz);
  assert.deepEqual(JSON.parse(JSON.stringify(t.usWeightRatesCents)), US_WEIGHT_RATES_CENTS);
  assert.deepEqual(JSON.parse(JSON.stringify(t.usLetterRates)), US_UNTRACKED_LETTER_RATES.map((r) => [r.maxOz, r.amountCents]));
  assert.deepEqual(JSON.parse(JSON.stringify(t.caRates)), WEIGHT_SHIPPING_RATES.CA.map((r) => [r.maxOz, r.amountCents]));
  assert.deepEqual(JSON.parse(JSON.stringify(t.intlRates)), WEIGHT_SHIPPING_RATES.INTL.map((r) => [r.maxOz, r.amountCents]));
});

test("cart.js estimate equals the server's price for every sample cart", () => {
  const { estimateCartShipping } = loadCartJs();
  const prices = { [BOOK]: 12.99, [BOOK_2]: 12.99, [BUNDLE]: 62, [COLORING]: 8.99, [STICKER]: 4.99, [STICKER_2]: 4.99, [STICKER_3]: 9.99 };
  const carts = [
    [[STICKER, 1]], [[STICKER, 3]], [[STICKER, 6]], [[STICKER, 7]], [[STICKER, 14]],
    [[STICKER, 1], [BOOK, 1]], [[BOOK, 1]], [[BOOK, 3]], [[BOOK, 17]], [[BUNDLE, 1]], [[BUNDLE, 2]],
    [[COLORING, 2], [STICKER_2, 1]], [[BOOK, 11]], [[BUNDLE, 46]], [[BUNDLE, 47]],
    [["archive", 3]], [["archive", 1], [STICKER, 1]],
  ];
  for (const region of ["US", "CA", "INTL"]) {
    for (const lines of carts) {
      const cartItems = lines.map(([id, q]) => id === "archive"
        ? { id: "archive-2026", productType: "kahani_times_archive", quantity: q, price: 5 }
        : { id, quantity: q, price: prices[id] });
      const lineItems = lines.map(([id, q]) => ({ price: id === "archive" ? ARCHIVE : id, quantity: q }));
      const subtotal = cartItems.reduce((s, i) => s + Math.round(i.price * 100) * i.quantity, 0);
      const label = `${region} ${JSON.stringify(lines)}`;

      const client = estimateCartShipping(cartItems, region);
      let server;
      try {
        server = getShippingOption(profile(lineItems), region, subtotal).amountCents;
      } catch (err) {
        assert.equal(client.status, "too_heavy", label);
        assert.equal(client.message, err.message, label);
        continue;
      }
      assert.equal(client.status, "ok", label);
      assert.equal(client.cents, server, label);
    }
  }
});

test("cart.js: empty cart and unknown products don't invent a price", () => {
  const { estimateCartShipping } = loadCartJs();
  assert.equal(estimateCartShipping([], "US").status, "empty");
  assert.equal(estimateCartShipping([{ id: "price_new_product", quantity: 1, price: 5 }], "US").status, "unknown");
});
