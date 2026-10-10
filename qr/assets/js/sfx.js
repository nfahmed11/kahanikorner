// --------------------
// Game sound effects, loaded after the page
// --------------------
// Sounds no longer download alongside the page's pictures and scripts. A game's
// sounds start loading once the page has finished loading (or on the player's
// first touch, click or key press, if that comes sooner), so they are ready by
// the time they are needed, and a sound a game never plays is never downloaded.
// Each sound keeps its own <audio> element, as before, so different sounds can
// overlap. Files, volume and timing are unchanged.
const sounds = [];
let started = false;

export function gameSound(url) {
  let el = null;
  const sound = {
    load() {
      if (!el) {
        el = new Audio(url);
        el.preload = "auto";
      }
      return el;
    },
    play() {
      try {
        const a = sound.load();
        a.currentTime = 0;
        a.play().catch(() => {});
      } catch (_) {}
    },
  };
  sounds.push(sound);
  if (started) sound.load();
  return sound;
}

const EVENTS = ["pointerdown", "touchstart", "keydown"];
function loadAll() {
  if (started) return;
  started = true;
  EVENTS.forEach((t) => removeEventListener(t, loadAll, true));
  sounds.forEach((s) => s.load());
}
EVENTS.forEach((t) => addEventListener(t, loadAll, { capture: true, passive: true }));

if (document.readyState === "complete") setTimeout(loadAll);
else addEventListener("load", () => setTimeout(loadAll), { once: true });
