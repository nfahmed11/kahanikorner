/*
 * Kahani Korner — Shared Footer Loader
 * Fetches /components/footer.html and injects it into #footer-placeholder.
 * Also injects /assets/css/footer.css for the grid layout styles.
 *
 * Edit the footer in ONE place only: /components/footer.html
 */
(function () {
  var placeholder = document.getElementById('footer-placeholder');
  if (!placeholder) return;

  /* ── Inject footer.css into <head> if not already present ── */
  function injectCSS() {
    var cssPath = '/assets/css/footer.css';
    var existing = document.querySelector('link[href="' + cssPath + '"]');
    if (existing) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssPath;
    document.head.appendChild(link);
  }

  /* ── Fetch footer HTML and inject into placeholder ── */
  injectCSS();

  fetch('/components/footer.html')
    .then(function (r) {
      if (!r.ok) throw new Error('footer fetch failed: ' + r.status);
      return r.text();
    })
    .then(function (html) {
      placeholder.outerHTML = html;
    })
    .catch(function (err) {
      console.warn('Footer loader:', err);
    });
})();
