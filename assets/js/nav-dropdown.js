/* Kahani Korner — Free Resources dropdown + mobile sliding panel */
(function () {
  var navDropdown = document.getElementById("nav-dropdown");
  var navTrigger  = document.getElementById("nav-dropdown-trigger");

  /* ── Desktop: click/keyboard toggle (hover is handled by CSS) ── */
  if (navTrigger) {
    navTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = navDropdown.classList.toggle("is-open");
      navTrigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    navTrigger.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        navDropdown.classList.remove("is-open");
        navTrigger.setAttribute("aria-expanded", "false");
        navTrigger.focus();
      }
    });
  }

  /* Close desktop dropdown when clicking outside */
  document.addEventListener("click", function (e) {
    if (navDropdown && !navDropdown.contains(e.target)) {
      navDropdown.classList.remove("is-open");
      if (navTrigger) navTrigger.setAttribute("aria-expanded", "false");
    }
  });

  /* Close desktop dropdown when a menu item is clicked */
  if (navDropdown) {
    navDropdown.querySelectorAll(".dropdown-menu__item").forEach(function (item) {
      item.addEventListener("click", function () {
        navDropdown.classList.remove("is-open");
        if (navTrigger) navTrigger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ── Mobile: sliding sub-panel ── */
  var freeResourcesBtn = document.getElementById("mobile-free-resources-btn");
  var backBtn          = document.getElementById("mobile-panel-back");
  var mainPanel        = document.getElementById("mobile-panel-main");
  var resourcesPanel   = document.getElementById("mobile-panel-resources");
  var menuOverlay      = document.getElementById("mobile-menu-overlay");

  function showResourcesPanel() {
    if (mainPanel)      mainPanel.classList.add("slide-away");
    if (resourcesPanel) resourcesPanel.classList.add("slide-in");
  }
  function showMainPanel() {
    if (mainPanel)      mainPanel.classList.remove("slide-away");
    if (resourcesPanel) resourcesPanel.classList.remove("slide-in");
  }

  if (freeResourcesBtn) freeResourcesBtn.addEventListener("click", showResourcesPanel);
  if (backBtn)          backBtn.addEventListener("click", showMainPanel);

  /* Tapping a resource link closes the whole mobile menu */
  if (resourcesPanel && menuOverlay) {
    resourcesPanel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        menuOverlay.classList.remove("open");
        setTimeout(function () { menuOverlay.classList.add("hidden"); }, 300);
      });
    });
  }

  /* Reset to main panel whenever the overlay closes */
  if (menuOverlay) {
    new MutationObserver(function () {
      if (!menuOverlay.classList.contains("open")) showMainPanel();
    }).observe(menuOverlay, { attributes: true, attributeFilter: ["class"] });
  }
})();
