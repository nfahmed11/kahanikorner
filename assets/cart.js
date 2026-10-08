// cart.js — shared cart logic for all Kahani Korner pages
// NOT a module; loaded as a plain <script> tag

// ---- CONFIG ----
const CART_KEY = "kahani_cart";
const SHIP_REGION_KEY = "kahani_ship_region";

// ---- SHIPPING TABLES (display only) ----
// The cart shows shipping instantly from these; checkout re-prices everything
// on the server (functions/shipping.js), which is the authority.
// BEGIN SHIPPING TABLES — must match functions/shipping.js (shipping.test.js checks).
const SHIPPING_TABLES = {
  freeUsThresholdCents: 6500,
  // Stripe price ID → [weight in oz, "flat" | "parcel"]
  products: {
    price_1SYLwPP4FFhr5UNAc6JmV0iR: [24, "parcel"],
    price_1TbIF6P4FFhr5UNAXn6meNvr: [6, "parcel"],
    price_1TbIHDP4FFhr5UNAeyIkRrax: [6, "parcel"],
    price_1TbIIEP4FFhr5UNAaJeT8y6Y: [6, "parcel"],
    price_1TbIGJP4FFhr5UNAeGEVz0Ko: [6, "parcel"],
    price_1Tb6jbP4FFhr5UNAHcybrHON: [1, "flat"],
    price_1Tb6DjP4FFhr5UNApKWkP5wA: [1, "flat"],
    price_1SvrPwP4FFhr5UNAhWnlzbu5: [1, "flat"],
    price_1TjQGxP4FFhr5UNAMtrY7cJq: [5, "parcel"],
  },
  archiveEditionWeightOz: 1, // Kahani Times Archive, per edition (parcel)
  // US parcel rate in cents by billable whole pound (index = pounds, 1–70)
  usWeightRatesCents: [
    null,
    439, 513, 586, 660, 734, 808, 881, 955, 1029, 1102,
    1176, 1250, 1323, 1397, 1471, 1544, 1618, 1692, 1765, 1839,
    1913, 1986, 2060, 2134, 2207, 2281, 2355, 2429, 2502, 2576,
    2650, 2723, 2797, 2871, 2944, 3018, 3092, 3165, 3239, 3313,
    3386, 3460, 3534, 3607, 3681, 3755, 3828, 3902, 3976, 4049,
    4123, 4197, 4271, 4344, 4418, 4492, 4565, 4639, 4713, 4786,
    4860, 4934, 5007, 5081, 5155, 5228, 5302, 5376, 5449, 5523,
  ],
  // US untracked letter mail, all-flat orders only: [max oz, cents]
  usLetterRates: [[1, 82], [2, 111], [3, 140], [4, 169], [5, 198], [6, 227]],
  // Canada / International: [max oz, cents]
  caRates: [[8, 1299], [16, 1499], [32, 1899], [48, 2299], [64, 2999]],
  intlRates: [[8, 1499], [16, 1899], [32, 2299], [48, 2999], [64, 3399]],
};
// END SHIPPING TABLES
const FREE_US_SHIPPING_THRESHOLD_CENTS = SHIPPING_TABLES.freeUsThresholdCents;

// ---- STATE ----
let cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];

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

// Integer cents for display; avoids float drift (e.g. 4 × 15.99).
function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getCartSubtotalCents(items) {
  return items.reduce(
    (sum, item) => sum + Math.round(item.price * 100) * item.quantity,
    0,
  );
}

// Shipping weight of one cart line in ounces (weight × quantity), or null
// when the product has no shipping data here.
function getItemWeightOz(item) {
  if (item.productType === "kahani_times_archive") {
    return SHIPPING_TABLES.archiveEditionWeightOz * item.quantity;
  }
  const data = SHIPPING_TABLES.products[item.id];
  return data ? data[0] * item.quantity : null;
}

// Mirrors getShippingOption() in functions/shipping.js. Returns
//   { status: "empty" }
//   { status: "unknown" }                       — server prices it at checkout
//   { status: "too_heavy", message }
//   { status: "ok", cents, letterMail }
function estimateCartShipping(items, region) {
  if (items.length === 0) return { status: "empty" };

  let weightOz = 0;
  let allFlat = true;
  for (const item of items) {
    const oz = getItemWeightOz(item);
    if (oz === null) return { status: "unknown" };
    weightOz += oz;
    const data = SHIPPING_TABLES.products[item.id];
    if (!data || data[1] !== "flat") allFlat = false;
  }

  if (region === "US") {
    const pounds = Math.max(1, Math.ceil(Math.round((weightOz / 16) * 10000) / 10000));
    if (pounds >= SHIPPING_TABLES.usWeightRatesCents.length) {
      return { status: "too_heavy", message: "Please contact us for shipping on orders over 70 lb." };
    }
    if (getCartSubtotalCents(items) >= FREE_US_SHIPPING_THRESHOLD_CENTS) {
      return { status: "ok", cents: 0, letterMail: false };
    }
    const letter = allFlat && SHIPPING_TABLES.usLetterRates.find(([maxOz]) => weightOz <= maxOz);
    if (letter) return { status: "ok", cents: letter[1], letterMail: true };
    return { status: "ok", cents: SHIPPING_TABLES.usWeightRatesCents[pounds], letterMail: false };
  }

  const tiers = region === "CA" ? SHIPPING_TABLES.caRates : SHIPPING_TABLES.intlRates;
  const tier = tiers.find(([maxOz]) => weightOz <= maxOz);
  if (!tier) {
    return {
      status: "too_heavy",
      message: "Orders over 4 lb can't be shipped to Canada or internationally online yet. Please contact us to place this order.",
    };
  }
  return { status: "ok", cents: tier[1], letterMail: false };
}

// Shipping, total and free-shipping messages in the cart footer. Called on
// every cart render by both the default and subscribe.html cart UIs, so they
// update whenever items, quantities or the region change.
window.renderCartShipping = function (items) {
  const region = window.getCartShipRegion();
  const subtotal = getCartSubtotalCents(items);
  const estimate = estimateCartShipping(items, region);
  const unlocked = region === "US" && subtotal >= FREE_US_SHIPPING_THRESHOLD_CENTS;

  const select = document.getElementById("cart-ship-region");
  const shipEl = document.getElementById("cart-shipping-amount");
  const grandTotalEl = document.getElementById("cart-grand-total");
  const progressEl = document.getElementById("cart-ship-progress");
  const noteEl = document.getElementById("cart-ship-note");

  if (select) select.value = region;

  if (shipEl) {
    shipEl.textContent =
      estimate.status === "ok" ? (estimate.cents === 0 ? "FREE" : formatCents(estimate.cents))
      : estimate.status === "empty" ? formatCents(0)
      : estimate.status === "too_heavy" ? "Contact us"
      : "Calculated at checkout";
  }
  if (grandTotalEl) {
    grandTotalEl.textContent = estimate.status === "ok"
      ? formatCents(subtotal + estimate.cents)
      : formatCents(subtotal);
  }

  if (noteEl) {
    noteEl.hidden = unlocked && estimate.status !== "too_heavy";
    noteEl.classList.toggle("cart-ship-note--error", estimate.status === "too_heavy");
    noteEl.textContent =
      estimate.status === "too_heavy" ? estimate.message
      : region !== "US" ? "Shipping is based on package weight."
      : estimate.letterMail ? "Sticker-only orders ship by untracked letter mail. Free US shipping on $65+"
      : "Free US shipping on $65+";
  }
  if (progressEl) {
    progressEl.hidden = region !== "US" || subtotal === 0 || estimate.status === "too_heavy";
    progressEl.textContent = unlocked
      ? "Free US shipping unlocked"
      : `You're ${formatCents(FREE_US_SHIPPING_THRESHOLD_CENTS - subtotal)} away from free US shipping.`;
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

// Cart checkout (default and subscribe.html) asks this for the shipping
// fields to send. Returns null — after telling the customer why — when the
// order can't be checked out online (e.g. over the weight limit).
window.getCartShippingSelection = function () {
  const region = window.getCartShipRegion();
  const estimate = estimateCartShipping(getStoredCartItems(), region);
  if (estimate.status === "too_heavy") {
    alert(estimate.message);
    return null;
  }
  return { shippingRegion: region };
};

function getStoredCartItems() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (_) {
    return [];
  }
}

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