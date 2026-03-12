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

function buildStripePayload(cartItems) {
  const line_items = cartItems.map((item) => ({
    price: item.id,
    quantity: item.quantity,
  }));
  return { line_items };
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
function updateCartUI() {
  if (cartBadge) {
    const totalItems = getCartTotalItems();
    cartBadge.textContent = totalItems;
    cartBadge.classList.toggle("hidden", totalItems === 0);
  }

  if (cartTotal) {
    cartTotal.textContent = `$${getCartTotalPrice().toFixed(2)}`;
  }

  if (cartItemsBox) {
    if (cart.length === 0) {
      cartItemsBox.innerHTML =
        '<div class="empty-cart-msg">Your cart is empty.</div>';
    } else {
      cartItemsBox.innerHTML = cart
        .map(
          (item) => `
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
        </div>
      `
        )
        .join("");
    }
  }
}

function openCart() {
  if (!cartOverlay) return;
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

  const { line_items } = buildStripePayload(cart);
  const originalText = checkoutBtn.innerText;
  checkoutBtn.innerText = "Redirecting to Stripe...";
  checkoutBtn.disabled = true;

  try {
    const response = await fetch("/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: line_items }),
    });

    if (!response.ok) {
      alert("There was a problem starting checkout. Please try again.");
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
function initCart() {
  updateCartUI();

  if (cartBtn)      cartBtn.addEventListener("click", openCart);
  if (closeCartBtn) closeCartBtn.addEventListener("click", closeCart);
  if (cartOverlay) {
    cartOverlay.addEventListener("click", (e) => {
      if (e.target === cartOverlay) closeCart();
    });
  }
  // Wire checkout button — was missing in the original cart.js
  if (checkoutBtn)  checkoutBtn.addEventListener("click", handleCheckout);

  // Sync cart across tabs/pages
  window.addEventListener("storage", (event) => {
    if (event.key === CART_KEY) {
      cart = JSON.parse(event.newValue) || [];
      updateCartUI();
    }
  });
}

document.addEventListener("DOMContentLoaded", initCart);