// cart.js — shared cart logic for all Kahani Korner pages
// NOT a module; loaded as a plain <script> tag

// ---- CONFIG ----
const CART_KEY = "kahani_cart";

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

// ---- CHECKOUT ----
async function handleCheckout() {
  if (!checkoutBtn || cart.length === 0) return;

  const originalText = checkoutBtn.innerText;
  checkoutBtn.innerText = "Redirecting to Stripe...";
  checkoutBtn.disabled = true;

  try {
    // Send raw cart items; backend routes each item to the correct Stripe price
    const response = await fetch("/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartItems: cart, cancelUrl: window.location.href }),
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