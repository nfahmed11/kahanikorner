/*
 * Kahani Korner — Shared Navbar Loader
 * Fetches /components/navbar.html and injects it into #navbar-placeholder.
 * Also handles all navbar JS: mobile menu, Free Resources dropdown/panel, cart.
 *
 * Edit the navbar in ONE place only: /components/navbar.html
 */
(function () {
  /* ── Active-state detection ── */
  function setActiveNav() {
    var path = window.location.pathname.toLowerCase().replace(/\/$/, '');
    var isShop      = path.includes('/products');
    var isSubscribe = path.includes('/subscribe');
    var isResources = path.includes('/resources');

    document.querySelectorAll('[data-nav]').forEach(function (el) {
      el.classList.remove('nav-active');
    });

    if (isShop) {
      document.querySelectorAll('[data-nav="shop"]').forEach(function (el) { el.classList.add('nav-active'); });
    } else if (isSubscribe) {
      document.querySelectorAll('[data-nav="subscribe"]').forEach(function (el) { el.classList.add('nav-active'); });
    } else if (isResources) {
      var trigger = document.getElementById('nav-dropdown-trigger');
      if (trigger) trigger.classList.add('nav-active');
    }
  }

  /* ── Mobile menu open / close ── */
  function initMobileMenu() {
    var toggle  = document.getElementById('mobile-toggle');
    var overlay = document.getElementById('mobile-menu-overlay');
    var closeBtn = overlay ? overlay.querySelector('.mobile-menu__close') : null;

    function openMenu() {
      if (!overlay) return;
      overlay.classList.remove('hidden');
      requestAnimationFrame(function () { overlay.classList.add('open'); });
    }
    function closeMenu() {
      if (!overlay) return;
      overlay.classList.remove('open');
      setTimeout(function () { overlay.classList.add('hidden'); }, 300);
      showMainPanel(); // reset sub-panel
    }

    if (toggle) toggle.addEventListener('click', openMenu);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeMenu();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);

    // Close when a main-panel link is tapped
    if (overlay) {
      overlay.querySelectorAll('.mobile-menu__links a').forEach(function (link) {
        link.addEventListener('click', closeMenu);
      });
    }
  }

  /* ── Mobile sliding sub-panel ── */
  function showMainPanel() {
    var main = document.getElementById('mobile-panel-main');
    var res  = document.getElementById('mobile-panel-resources');
    if (main) main.classList.remove('slide-away');
    if (res)  res.classList.remove('slide-in');
  }
  function showResourcesPanel() {
    var main = document.getElementById('mobile-panel-main');
    var res  = document.getElementById('mobile-panel-resources');
    if (main) main.classList.add('slide-away');
    if (res)  res.classList.add('slide-in');
  }

  function initMobilePanel() {
    var freeBtn = document.getElementById('mobile-free-resources-btn');
    var backBtn = document.getElementById('mobile-panel-back');
    var resPanel = document.getElementById('mobile-panel-resources');
    var overlay  = document.getElementById('mobile-menu-overlay');

    if (freeBtn) freeBtn.addEventListener('click', showResourcesPanel);
    if (backBtn) backBtn.addEventListener('click', showMainPanel);

    if (resPanel && overlay) {
      resPanel.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          overlay.classList.remove('open');
          setTimeout(function () { overlay.classList.add('hidden'); }, 300);
        });
      });
    }
  }

  /* ── Desktop Free Resources dropdown ── */
  function initDropdown() {
    var wrap    = document.getElementById('nav-dropdown');
    var trigger = document.getElementById('nav-dropdown-trigger');

    if (trigger) {
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          wrap.classList.remove('is-open');
          trigger.focus();
        }
      });
    }

    document.addEventListener('click', function (e) {
      if (wrap && !wrap.contains(e.target)) {
        wrap.classList.remove('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    });

    if (wrap) {
      wrap.querySelectorAll('.dropdown-menu__item').forEach(function (item) {
        item.addEventListener('click', function () {
          wrap.classList.remove('is-open');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /* ── Dynamically load cart.js after navbar is in the DOM ── */
  function loadCart() {
    var s = document.createElement('script');
    s.src = '/assets/cart.js';
    document.body.appendChild(s);
  }

  /* ── Main: fetch, inject, then init everything ── */
  var placeholder = document.getElementById('navbar-placeholder');
  if (!placeholder) return;

  fetch('/components/navbar.html')
    .then(function (r) {
      if (!r.ok) throw new Error('navbar fetch failed');
      return r.text();
    })
    .then(function (html) {
      placeholder.outerHTML = html;
      setActiveNav();
      initMobileMenu();
      initMobilePanel();
      initDropdown();
      loadCart();
    })
    .catch(function (err) {
      console.warn('Navbar loader:', err);
    });
})();
