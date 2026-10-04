// cart.js — shared cart logic for all Kahani Korner pages
// NOT a module; loaded as a plain <script> tag

// ---- CONFIG ----
const CART_KEY = "kahani_cart";
const SHIP_REGION_KEY = "kahani_ship_region";
// Display only — the server recomputes the subtotal from Stripe prices and decides shipping.
const FREE_US_SHIPPING_THRESHOLD_CENTS = 6500;
// Shipping destination (ZIP / postal code / country) saved per region. The
// server prices shipping from it; services are chosen on Stripe Checkout.
const SHIP_DEST_KEY = "kahani_ship_destination";
// Mirrors INTL_SHIPPING_COUNTRIES in functions/shipping.js (server re-validates).
const INTL_COUNTRY_CODES = (
  "AC AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ " +
  "BR BS BT BV BW BY BZ CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC " +
  "EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB " +
  "LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU " +
  "RW SA SB SC SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TA TC TD TF TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG UY UZ VA VC VE VG VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

// ---- STATE ----
let cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
let cartDestination = null; // ZIP / postal fields in the cart footer (set in initCart)

// ---- DOM HOOKS (gracefully null on pages that don't have them) ----
const cartBtn      = document.getElementById("cart-btn");
const closeCartBtn = document.getElementById("close-cart");
const cartOverlay  = document.getElementById("cart-overlay");
const cartItemsBox = document.getElementById("cart-items");
const cartTotal    = document.getElementById("cart-total-amount");
const cartBadge    = document.getElementById("cart-badge");
const checkoutBtn  = document.getElementById("checkout-btn");

// ---- HELPERS ----
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function getCartTotalItems() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartTotalPrice() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// "US", "CA" or "INTL" (rest of world). Shared with Archive Buy Now on subscribe.html.
function normalizeShipRegion(value) {
  return value === "CA" || value === "INTL" ? value : "US";
}

window.getCartShipRegion = function () {
  try {
    return normalizeShipRegion(localStorage.getItem(SHIP_REGION_KEY));
  } catch (_) {
    return "US";
  }
};

// Free-shipping progress in the cart footer. Integer cents avoid float drift
// (e.g. 4 × 15.99). Called by both the default and subscribe.html cart UIs.
window.renderCartShipping = function (items) {
  const region = window.getCartShipRegion();
  const subtotal = items.reduce(
    (sum, item) => sum + Math.round(item.price * 100) * item.quantity,
    0,
  );
  const unlocked = region === "US" && subtotal >= FREE_US_SHIPPING_THRESHOLD_CENTS;

  const select = document.getElementById("cart-ship-region");
  const shipEl = document.getElementById("cart-shipping-amount");
  const progressEl = document.getElementById("cart-ship-progress");
  const noteEl = document.getElementById("cart-ship-note");

  if (select) select.value = region;
  if (cartDestination) cartDestination.syncRegion();
  // Service and price are chosen on Stripe Checkout.
  if (shipEl) shipEl.textContent = "Calculated at checkout";
  if (noteEl) {
    noteEl.hidden = unlocked;
    noteEl.textContent = region === "US"
      ? "Free US shipping on $65+"
      : "Shipping is based on package weight and destination.";
  }
  if (progressEl) {
    progressEl.hidden = region !== "US" || subtotal === 0;
    progressEl.textContent = unlocked
      ? "Free US shipping unlocked"
      : `You're $${((FREE_US_SHIPPING_THRESHOLD_CENTS - subtotal) / 100).toFixed(2)} away from free US shipping.`;
  }
};

// ---- PUBLIC API ----
// Exposed on window so any page script can call these directly.

window.addToCart = function (product) {
  // product must have: id, name, price, image
  const existing = cart.find((item) => item.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }
  saveCart();
  updateCartUI();
  openCart();
};

window.removeFromCart = function (productId) {
  cart = cart.filter((item) => item.id !== productId);
  saveCart();
  updateCartUI();
};

window.updateQuantity = function (productId, delta) {
  const item = cart.find((item) => item.id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    window.removeFromCart(productId);
  } else {
    saveCart();
    updateCartUI();
  }
};

window.openCart = openCart;   // expose so inline onclick attributes can call it
window.closeCart = closeCart; // same

// ---- UI ----
// Pages that need custom cart rendering (e.g. subscribe.html) define window.updateCartUI
// before this script loads. The guard below preserves that custom version.
window.updateCartUI = window.updateCartUI || function updateCartUI() {
  // Query live so this works even if called before the navbar finished loading
  const badge = document.getElementById("cart-badge") || cartBadge;
  const totalEl = document.getElementById("cart-total-amount") || cartTotal;
  const box = document.getElementById("cart-items") || cartItemsBox;

  if (badge) {
    const totalItems = getCartTotalItems();
    badge.textContent = totalItems;
    badge.classList.toggle("hidden", totalItems === 0);
  }

  if (totalEl) {
    totalEl.textContent = `$${getCartTotalPrice().toFixed(2)}`;
  }

  window.renderCartShipping(cart);

  if (box) {
    if (cart.length === 0) {
      box.innerHTML =
        '<div class="empty-cart-msg">Your cart is empty.</div>';
    } else {
      box.innerHTML = cart
        .map((item) => {
          if (item.productType === "kahani_times_archive") {
            const monthList = Array.isArray(item.selectedMonths)
              ? item.selectedMonths.join(", ")
              : (item.selectedMonths || "");
            return `
              <div class="cart-item">
                <img src="${item.image || '/assets/images/products/subscribe/jan.png'}" alt="${item.name}">
                <div class="cart-item-details">
                  <h4>${item.name}</h4>
                  <div style="font-size:0.75rem;color:#888;margin-top:0.15rem;line-height:1.65;">
                    <span style="display:block;"><strong>Year:</strong> ${item.selectedYear}</span>
                    <span style="display:block;"><strong>Months:</strong> ${monthList}</span>
                    <span style="display:block;"><strong>Qty:</strong> ${item.quantity}</span>
                  </div>
                  <div class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
                  <div class="cart-controls">
                    <button class="remove-btn" onclick="removeFromCart('${item.id}')">Remove</button>
                  </div>
                </div>
              </div>`;
          }
          return `
            <div class="cart-item">
              <img src="${item.image}" alt="${item.name}">
              <div class="cart-item-details">
                <h4>${item.name}</h4>
                <div class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
                <div class="cart-controls">
                  <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
                  <span>${item.quantity}</span>
                  <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
                  <button class="remove-btn" onclick="removeFromCart('${item.id}')">Remove</button>
                </div>
              </div>
            </div>`;
        })
        .join("");
    }
  }
};

function openCart() {
  if (!cartOverlay) return;
  updateCartUI();
  cartOverlay.classList.remove("hidden");
  setTimeout(() => cartOverlay.classList.add("open"), 10);
}

function closeCart() {
  if (!cartOverlay) return;
  cartOverlay.classList.remove("open");
  setTimeout(() => cartOverlay.classList.add("hidden"), 300);
}

// ---- SHIPPING DESTINATION ----
// The cart collects only what the server needs to price shipping: region +
// ZIP / postal code (+ country for International). The server builds the
// shipping choices (live USPS rates or the fixed fallback) and the customer
// picks one on Stripe Checkout. No prices, weights or services are sent from here.

function readShipStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (_) {
    return null;
  }
}

function writeShipStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function getStoredDestination(region) {
  const all = readShipStore(SHIP_DEST_KEY);
  const d = all && typeof all === "object" ? all[region] : null;
  return d && typeof d === "object"
    ? { country: String(d.country || ""), postalCode: String(d.postalCode || "") }
    : null;
}

function storeDestination(region, destination) {
  const all = readShipStore(SHIP_DEST_KEY);
  const next = all && typeof all === "object" && !Array.isArray(all) ? all : {};
  next[region] = destination;
  writeShipStore(SHIP_DEST_KEY, next);
}

// Basic client-side check; the server validates again and is the authority.
function checkDestination(region, destination) {
  const postal = (destination.postalCode || "").trim();
  if (region === "US") {
    return /^\d{5}(-\d{4})?$/.test(postal) ? "" : "Please enter a valid 5-digit ZIP code.";
  }
  if (region === "CA") {
    return /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(postal) ? "" : "Please enter a valid Canadian postal code (e.g. K1A 0B1).";
  }
  return destination.country ? "" : "Please choose your country.";
}

// Saved destination for the current region, if it is complete and valid.
function getValidStoredDestination(region) {
  const d = getStoredDestination(region);
  if (!d) return null;
  const destination = {
    country: region === "US" ? "US" : region === "CA" ? "CA" : d.country,
    postalCode: d.postalCode.trim().toUpperCase(),
  };
  return checkDestination(region, destination) ? null : destination;
}

let intlCountryOptions = null;
function getIntlCountryOptions() {
  if (intlCountryOptions) return intlCountryOptions;
  let names = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch (_) {}
  intlCountryOptions = INTL_COUNTRY_CODES.map((code) => {
    let name = code;
    try {
      name = (names && names.of(code)) || code;
    } catch (_) {}
    return { code, name };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return intlCountryOptions;
}

// ZIP / postal code (+ country for International) fields, used in the cart
// footer and the Buy Now destination dialog.
function createDestinationFields(root, getRegion) {
  root.classList.add("ship-est");
  root.innerHTML = `
    <div class="ship-est__fields">
      <label class="ship-est__field ship-est__country" hidden>
        <span>Country</span>
        <select class="ship-est__country-select" autocomplete="country">
          <option value="">Select a country</option>
        </select>
      </label>
      <label class="ship-est__field">
        <span class="ship-est__postal-label">ZIP code</span>
        <input class="ship-est__postal" type="text" autocomplete="postal-code" maxlength="10" spellcheck="false" />
      </label>
    </div>
    <p class="ship-est__msg" role="status" aria-live="polite"></p>`;

  const countryField = root.querySelector(".ship-est__country");
  const countrySelect = root.querySelector(".ship-est__country-select");
  const postalLabel = root.querySelector(".ship-est__postal-label");
  const postalInput = root.querySelector(".ship-est__postal");
  const msgEl = root.querySelector(".ship-est__msg");
  let currentRegion = null;

  function setMsg(text) {
    msgEl.textContent = text || "";
    msgEl.classList.toggle("ship-est__msg--error", Boolean(text));
  }

  function read() {
    const region = getRegion();
    return {
      country: region === "US" ? "US" : region === "CA" ? "CA" : countrySelect.value,
      postalCode: postalInput.value.trim().toUpperCase(),
    };
  }

  function save() {
    storeDestination(getRegion(), read());
    setMsg("");
  }

  postalInput.addEventListener("input", save);
  countrySelect.addEventListener("change", save);

  const api = {
    // Match labels / fields to the selected region and restore its saved destination.
    syncRegion() {
      const region = getRegion();
      if (region === currentRegion) return;
      currentRegion = region;

      countryField.hidden = region !== "INTL";
      if (region === "INTL" && countrySelect.options.length === 1) {
        getIntlCountryOptions().forEach(({ code, name }) => {
          countrySelect.add(new Option(name, code));
        });
      }
      postalLabel.textContent =
        region === "US" ? "ZIP code" : region === "CA" ? "Postal code" : "Postal code (if used)";
      postalInput.inputMode = region === "US" ? "numeric" : "text";

      const stored = getStoredDestination(region);
      postalInput.value = stored ? stored.postalCode : "";
      if (region === "INTL") countrySelect.value = stored ? stored.country : "";
      setMsg("");
    },

    // { shippingRegion, destination } when valid; otherwise shows why,
    // focuses the field and returns null.
    validate() {
      api.syncRegion();
      const region = getRegion();
      const destination = read();
      const problem = checkDestination(region, destination);
      if (problem) {
        setMsg(problem);
        (region === "INTL" && !destination.country ? countrySelect : postalInput).focus();
        return null;
      }
      storeDestination(region, destination);
      setMsg("");
      return { shippingRegion: region, destination };
    },

    focus() {
      (getRegion() === "INTL" && !countrySelect.value ? countrySelect : postalInput).focus();
    },
  };

  api.syncRegion();
  return api;
}

// Cart checkout (default and subscribe.html) asks this for the shipping
// fields. Returns null — after prompting in the cart — until they're valid.
window.getCartShippingSelection = function () {
  if (!cartDestination) return { shippingRegion: window.getCartShipRegion() };
  return cartDestination.validate();
};

// ---- BUY NOW DESTINATION DIALOG ----
// window.ensureShippingDestination({ title }) → Promise resolving to
// { shippingRegion, destination }, or null if the customer closes the dialog.
// Uses the saved destination when it is already complete; otherwise asks for
// it in a compact dialog built from the same cart fields.
let destinationDialog = null;

function getDestinationDialog() {
  if (destinationDialog) return destinationDialog;

  const overlay = document.createElement("div");
  overlay.className = "ship-modal hidden";
  overlay.innerHTML = `
    <div class="ship-modal__card" role="dialog" aria-modal="true" aria-labelledby="ship-modal-title">
      <div class="ship-modal__head">
        <h3 id="ship-modal-title" class="ship-modal__title">Where are we shipping?</h3>
        <button type="button" class="close-btn ship-modal__close" aria-label="Close">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <p class="ship-modal__item"></p>
      <label class="cart-ship-region">
        <span>Shipping to</span>
        <select class="ship-modal__region">
          <option value="US">United States</option>
          <option value="CA">Canada</option>
          <option value="INTL">International</option>
        </select>
      </label>
      <div class="ship-modal__fields"></div>
      <p class="cart-ship-note">Shipping options and prices are shown at checkout.</p>
      <button type="button" class="checkout-btn ship-modal__continue">Continue to checkout</button>
    </div>`;
  document.body.appendChild(overlay);

  const itemEl = overlay.querySelector(".ship-modal__item");
  const regionSelect = overlay.querySelector(".ship-modal__region");
  const fields = createDestinationFields(
    overlay.querySelector(".ship-modal__fields"),
    window.getCartShipRegion,
  );
  let resolver = null;
  let returnFocus = null;

  function close(result) {
    overlay.classList.add("hidden");
    document.removeEventListener("keydown", onKeydown);
    const resolve = resolver;
    resolver = null;
    if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus();
    if (resolve) resolve(result);
  }

  function onKeydown(e) {
    if (e.key === "Escape") close(null);
    if (e.key === "Enter" && e.target.classList.contains("ship-est__postal")) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const selection = fields.validate();
    if (selection) close(selection);
  }

  regionSelect.addEventListener("change", () => {
    try {
      localStorage.setItem(SHIP_REGION_KEY, normalizeShipRegion(regionSelect.value));
    } catch (_) {}
    fields.syncRegion();
    window.updateCartUI(); // keep the cart's / archive's "Shipping to" in sync
  });
  overlay.querySelector(".ship-modal__continue").addEventListener("click", submit);
  overlay.querySelector(".ship-modal__close").addEventListener("click", () => close(null));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close(null);
  });

  destinationDialog = {
    open(options, resolve) {
      if (resolver) close(null);
      resolver = resolve;
      returnFocus = document.activeElement;
      itemEl.textContent = (options && options.title) || "";
      itemEl.hidden = !itemEl.textContent;
      regionSelect.value = window.getCartShipRegion();
      fields.syncRegion();
      overlay.classList.remove("hidden");
      document.addEventListener("keydown", onKeydown);
      fields.focus();
    },
  };
  return destinationDialog;
}

window.ensureShippingDestination = function (options) {
  const region = window.getCartShipRegion();
  const saved = getValidStoredDestination(region);
  if (saved) return Promise.resolve({ shippingRegion: region, destination: saved });
  return new Promise((resolve) => getDestinationDialog().open(options, resolve));
};

// ---- CHECKOUT ----
async function handleCheckout() {
  if (!checkoutBtn || cart.length === 0) return;

  const shipping = window.getCartShippingSelection();
  if (!shipping) return;

  const originalText = checkoutBtn.innerText;
  checkoutBtn.innerText = "Redirecting to Stripe...";
  checkoutBtn.disabled = true;

  try {
    // Send raw cart items; backend routes each item to the correct Stripe price
    const response = await fetch("/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cartItems: cart,
        cancelUrl: window.location.href,
        shippingRegion: shipping.shippingRegion,
        destination: shipping.destination,
      }),
    });

    if (!response.ok) {
      let errMsg = "There was a problem starting checkout. Please try again.";
      try {
        const errData = await response.json();
        if (errData && errData.error) {
          console.error("Checkout error from server:", errData.error);
          errMsg = errData.error;
        }
      } catch (_) {}
      alert(errMsg);
      checkoutBtn.innerText = originalText;
      checkoutBtn.disabled = false;
      return;
    }

    const data = await response.json();
    window.location.href = data.url;
  } catch (err) {
    console.error("Checkout error:", err);
    alert("Unexpected error. Please try again.");
    checkoutBtn.innerText = originalText;
    checkoutBtn.disabled = false;
  }
}

// ---- INIT ----
let _cartInitialized = false;

function initCart() {
  // Guard: cart.js is loaded dynamically (via navbar-loader.js) so this function
  // could theoretically be called more than once if the loader runs twice.
  if (_cartInitialized) return;
  _cartInitialized = true;

  const destinationRoot = document.getElementById("cart-ship-estimator");
  if (destinationRoot) {
    cartDestination = createDestinationFields(destinationRoot, window.getCartShipRegion);
  }

  updateCartUI();

  if (cartBtn)      cartBtn.addEventListener("click", openCart);
  if (closeCartBtn) closeCartBtn.addEventListener("click", closeCart);
  if (cartOverlay) {
    cartOverlay.addEventListener("click", (e) => {
      if (e.target === cartOverlay) closeCart();
    });
  }
  // Wire checkout button — pages may override via window.customHandleCheckout
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", function () {
      if (typeof window.customHandleCheckout === "function") {
        window.customHandleCheckout();
      } else {
        handleCheckout();
      }
    });
  }

  const shipRegionSelect = document.getElementById("cart-ship-region");
  if (shipRegionSelect) {
    shipRegionSelect.addEventListener("change", () => {
      try {
        localStorage.setItem(SHIP_REGION_KEY, normalizeShipRegion(shipRegionSelect.value));
      } catch (_) {}
      updateCartUI();
    });
  }

  // Sync cart across tabs/pages
  window.addEventListener("storage", (event) => {
    if (event.key === CART_KEY) {
      cart = JSON.parse(event.newValue) || [];
      updateCartUI();
    }
  });
}

// cart.js is injected dynamically by navbar-loader.js (via document.createElement),
// which means it always runs after DOMContentLoaded has already fired.
// The defensive check below handles both load orders correctly.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCart);
} else {
  initCart();
}