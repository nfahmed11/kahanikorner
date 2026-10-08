/*
 * Kahani Korner — Shared "Buy Me A Chai" Support Popup
 *
 * A polite, scroll-triggered support message for the Free Resources section.
 * Loaded by:
 *   - a script tag on each /resources/ page (hub, listing, songs, cartoons, …)
 *   - every free resource page, automatically, via /assets/js/free-resource.js
 *
 * Behaviour:
 *   - Opens once the visitor has scrolled ~60% of the page.
 *   - Pages too short to scroll meaningfully open it after ~10s instead.
 *   - Shown on every page view (once per page; no cross-page memory).
 *   - Waits while the cart, mobile menu, another modal, or a form field is
 *     in use, so it never interrupts someone mid-task.
 *   - Desktop: centered modal. Mobile (<=700px): compact bottom sheet.
 *   - Closes via X, clicking outside, Escape, or clicking the CTA.
 *
 * Also injects /assets/css/support-card.css if the page hasn't linked it.
 *
 * Edit the support popup in ONE place only: this file.
 */
(function () {
  if (window.__kkChaiPopupInit) return;
  window.__kkChaiPopupInit = true;

  if (window.location.pathname.indexOf("/resources/") !== 0) return;

  var STRIPE_URL = "https://buy.stripe.com/cNiaEZ2oa31zefxcon0Fi0b";
  var CSS_PATH = "/assets/css/support-card.css";
  var SCROLL_TRIGGER = 0.6;
  var SHORT_PAGE_DELAY_MS = 10000;
  var BUSY_RETRY_MS = 3000;

  var COFFEE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'class="lucide lucide-coffee" aria-hidden="true" focusable="false">' +
    '<path d="M10 2v2"></path><path d="M14 2v2"></path>' +
    '<path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"></path>' +
    '<path d="M6 2v2"></path></svg>';

  function injectCSS() {
    if (document.querySelector('link[href="' + CSS_PATH + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_PATH;
    document.head.appendChild(link);
  }

  injectCSS();

  /* ── Trigger: scroll depth, or a timer on short pages ── */
  var opened = false;
  var ticking = false;
  var shortPageTimer = null;
  var busyTimer = null;

  function maxScroll() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }

  // "Short" = the page can't scroll even half a screen, so 60% is meaningless.
  function isShortPage() {
    return maxScroll() < window.innerHeight * 0.5;
  }

  function scrollDepth() {
    var max = maxScroll();
    return max > 0 ? window.scrollY / max : 0;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      if (!isShortPage() && scrollDepth() >= SCROLL_TRIGGER) tryOpen();
    });
  }

  function startShortPageFallback() {
    if (opened || shortPageTimer) return;
    shortPageTimer = window.setTimeout(function () {
      if (isShortPage()) tryOpen();
    }, SHORT_PAGE_DELAY_MS);
  }

  function stopTriggers() {
    window.removeEventListener("scroll", onScroll);
    window.clearTimeout(shortPageTimer);
    window.clearTimeout(busyTimer);
  }

  // Don't interrupt the cart, mobile menu, another modal, or someone typing.
  function pageIsBusy() {
    if (document.querySelector("#cart-overlay.open, #mobile-menu-overlay.open, .resource-modal-overlay.open")) {
      return true;
    }
    var active = document.activeElement;
    return !!active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
  }

  function tryOpen() {
    if (opened) return;
    if (pageIsBusy()) {
      window.clearTimeout(busyTimer);
      busyTimer = window.setTimeout(tryOpen, BUSY_RETRY_MS);
      return;
    }
    openPopup();
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // Measure page height only once the navbar, footer and images are in.
  if (document.readyState === "complete") {
    if (isShortPage()) startShortPageFallback();
  } else {
    window.addEventListener("load", function () {
      if (isShortPage()) startShortPageFallback();
    });
  }

  /* ── Popup ── */
  var overlay = null;
  var dialog = null;
  var lastFocused = null;
  var prevOverflow = "";
  var prevPaddingRight = "";

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function buildPopup() {
    var el = document.createElement("div");
    el.className = "chai-popup";
    el.innerHTML =
      '<div class="chai-popup__dialog" role="dialog" aria-modal="true" ' +
      'aria-labelledby="chai-popup-heading" aria-describedby="chai-popup-text">' +
      '<button type="button" class="chai-popup__close" aria-label="Close support message">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"></path></svg>' +
      "</button>" +
      '<span class="chai-popup__icon" aria-hidden="true">' + COFFEE_SVG + "</span>" +
      '<p class="chai-popup__eyebrow">Keep free resources growing</p>' +
      '<h2 class="chai-popup__title" id="chai-popup-heading">Was this helpful?</h2>' +
      '<p class="chai-popup__text" id="chai-popup-text">' +
      "If Kahani Korner made Urdu a little easier for your family, you can support more free resources with a chai." +
      "</p>" +
      '<a class="chai-popup__btn" href="' + STRIPE_URL + '" target="_blank" rel="noopener noreferrer" ' +
      'data-testid="link-chai-popup-buy-chai">' +
      COFFEE_SVG +
      "<span>Buy Me A Chai</span>" +
      '<span class="chai-popup__sr"> (opens in a new tab)</span>' +
      "</a>" +
      '<p class="chai-popup__note">Every chai helps me keep creating free Urdu resources for diaspora families.</p>' +
      "</div>";
    return el;
  }

  function focusables() {
    return dialog.querySelectorAll("button, a[href]");
  }

  function onKeydown(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      closePopup();
      return;
    }
    if (e.key !== "Tab") return;

    // Keep keyboard focus inside the popup.
    var items = focusables();
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!dialog.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  function lockScroll() {
    var root = document.documentElement;
    var scrollbar = window.innerWidth - root.clientWidth;
    prevOverflow = root.style.overflow;
    prevPaddingRight = root.style.paddingRight;
    root.style.overflow = "hidden";
    // Stop the page shifting sideways when the desktop scrollbar disappears.
    if (scrollbar > 0) root.style.paddingRight = scrollbar + "px";
  }

  function unlockScroll() {
    var root = document.documentElement;
    root.style.overflow = prevOverflow;
    root.style.paddingRight = prevPaddingRight;
  }

  function openPopup() {
    opened = true;
    stopTriggers();

    lastFocused = document.activeElement;
    overlay = buildPopup();
    dialog = overlay.querySelector(".chai-popup__dialog");
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePopup();
    });
    overlay.querySelector(".chai-popup__close").addEventListener("click", closePopup);
    // Let the link open Stripe in its new tab, then tidy up.
    overlay.querySelector(".chai-popup__btn").addEventListener("click", function () {
      window.setTimeout(closePopup, 0);
    });
    document.addEventListener("keydown", onKeydown);

    lockScroll();

    // Next frame so the entrance transition runs.
    window.requestAnimationFrame(function () {
      overlay.classList.add("is-open");
      overlay.querySelector(".chai-popup__close").focus();
    });
  }

  function closePopup() {
    if (!overlay) return;
    var el = overlay;
    overlay = null;

    document.removeEventListener("keydown", onKeydown);
    el.classList.remove("is-open");
    unlockScroll();

    if (lastFocused && document.contains(lastFocused) && typeof lastFocused.focus === "function") {
      lastFocused.focus({ preventScroll: true });
    }

    if (reduceMotion) {
      el.remove();
    } else {
      window.setTimeout(function () {
        el.remove();
      }, 350);
    }
  }
})();
