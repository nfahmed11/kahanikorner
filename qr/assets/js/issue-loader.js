/*
 * Issue loader — shared by the QR index page and every reusable game page.
 *
 * Each newspaper issue's content lives in ONE file:
 *   /qr/tkt/<YYYY>/<slug>/index.html
 * inside
 *   <script type="application/json" id="issue-config"> … </script>
 *
 * Game pages are opened as  /qr/assets/html/<game>.html?issue=<slug>
 * and call KKIssue.loadGame("<gameKey>") to get that game's section.
 *
 * Slug format: MMYY + 3 lowercase letters, e.g. "1026otc" → /qr/tkt/2026/1026otc/index.html
 * (Issues published before Oct 2026 use older page formats — see LEGACY notes in
 * index.js, fill-the-kahani.js and audionewsletter.js.)
 */

(function () {
  var SLUG_PATTERN = /^(0[1-9]|1[0-2])(\d{2})[a-z]{3}$/;
  var CONFIG_SELECTOR = 'script#issue-config[type="application/json"]';

  var cache = {};

  function getIssueSlug() {
    return new URLSearchParams(window.location.search).get("issue");
  }

  function isValidSlug(slug) {
    return typeof slug === "string" && SLUG_PATTERN.test(slug);
  }

  function issuePath(slug) {
    if (!isValidSlug(slug)) return null;
    var year = "20" + slug.slice(2, 4);
    return "/qr/tkt/" + year + "/" + slug + "/index.html";
  }

  // Parses the issue-config block out of a document (the current page, or a fetched one).
  // Returns null when the block is missing; throws on invalid JSON.
  function readConfigFromDocument(doc) {
    var el = doc.querySelector(CONFIG_SELECTOR);
    if (!el) return null;
    return JSON.parse(el.textContent);
  }

  function fail(reason, detail) {
    var error = new Error(reason);
    error.reason = reason;
    error.detail = detail;
    return error;
  }

  // Fetches and parses the issue's index.html once per page load.
  // Resolves to { config, baseUrl } — baseUrl lets games resolve "./assets/…" paths
  // written relative to the monthly folder.
  function loadIssue(slug) {
    if (slug === undefined) slug = getIssueSlug();
    if (!isValidSlug(slug)) return Promise.reject(fail("invalid-slug", slug));
    if (cache[slug]) return cache[slug];

    var url = new URL(issuePath(slug), window.location.origin).href;

    cache[slug] = fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw fail("not-found", res.status + " " + url);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var config;
        try {
          config = readConfigFromDocument(doc);
        } catch (e) {
          throw fail("invalid-json", e.message);
        }
        if (!config) throw fail("missing-config", url);
        if (!config.issue || config.issue.id !== slug) throw fail("id-mismatch", url);
        return { config: config, baseUrl: url };
      });

    return cache[slug];
  }

  // Resolves to { issue, game, gameConfig, baseUrl } for one game in the issue,
  // or rejects (reason "missing-game") when the issue doesn't include it / it's disabled.
  function loadGame(gameKey, slug) {
    return loadIssue(slug).then(function (result) {
      var gameConfig = result.config.games && result.config.games[gameKey];
      if (!gameConfig || gameConfig.enabled === false) throw fail("missing-game", gameKey);
      return {
        issue: result.config.issue,
        config: result.config,
        gameConfig: gameConfig,
        game: gameConfig.game || {},
        baseUrl: result.baseUrl,
      };
    });
  }

  // One console line per failure, for development.
  function logFailure(context, error) {
    var reason = (error && error.reason) || "error";
    var detail = error && error.detail ? " (" + error.detail + ")" : "";
    if (reason === "invalid-json" || reason === "error") {
      console.error("[KK issue] " + context + ": " + reason + detail, error);
    } else {
      console.warn("[KK issue] " + context + ": " + reason + detail);
    }
  }

  window.KKIssue = {
    getIssueSlug: getIssueSlug,
    isValidSlug: isValidSlug,
    issuePath: issuePath,
    readConfigFromDocument: readConfigFromDocument,
    loadIssue: loadIssue,
    loadGame: loadGame,
    logFailure: logFailure,
  };
})();
