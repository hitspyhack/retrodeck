/**
 * Install and update plumbing, kept apart from the app shell because the
 * settings view has to show the same truth the boot code acts on.
 *
 * Three browser behaviours are involved and they are independent:
 *
 *  - `beforeinstallprompt` is the only way a page can *ask* for an install.
 *    Chrome and Edge (desktop and Android) fire it once their install criteria
 *    pass; iOS Safari never fires it at all, so the UI has to fall back to
 *    instructions instead of a button that does nothing.
 *  - a *waiting* service worker means a newer build is already on disk but is
 *    staying out of the way until this tab agrees (`sw.js` answers
 *    `skip-waiting` and only then claims).
 *  - `display-mode` says whether we are already running as an installed app.
 *
 * Nothing here guesses at state: `status()` reads the live objects each time,
 * so a view that re-renders can never show a stale "Install" button.
 */

let deferredPrompt = null;
let registration = null;
let watching = false;
const subs = new Set();
const readyCbs = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Call once, before or after registration - repeat calls are no-ops. */
export function initPwa() {
  if (watching || typeof addEventListener !== "function") return;
  watching = true;
  addEventListener("beforeinstallprompt", (e) => {
    // Without preventDefault() the browser keeps the offer in its own menu and
    // never gives it back, so the in-app button would stay unavailable forever.
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/** app.js hands the registration over; this module never registers one itself. */
export function trackRegistration(reg) {
  registration = reg || null;
  registration?.addEventListener?.("updatefound", () => {
    const sw = registration.installing;
    sw?.addEventListener?.("statechange", () => {
      if (sw.state === "installed" && navigator.serviceWorker?.controller) {
        // A controller already exists, so this worker cannot take over by
        // itself: the tab has to reload. That is the case worth telling the
        // user about - a first install goes live on its own and stays quiet.
        for (const cb of [...readyCbs]) {
          try { cb(); } catch { /* a toast that threw is not worth a crash */ }
        }
      }
      notify();
    });
  });
  notify();
}

function standalone() {
  const mq = (q) => {
    try { return matchMedia(q)?.matches === true; } catch { return false; }
  };
  return mq("(display-mode: standalone)") || mq("(display-mode: minimal-ui)") || navigator.standalone === true;
}

/**
 * The registration may not have reached us yet - Settings can render before
 * boot's `register()` resolves, or be the only thing that asks. Read it from the
 * browser instead of showing a stale "no service worker".
 */
export async function ensureTracked() {
  if (!registration && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration?.();
      if (reg) trackRegistration(reg);
    } catch {
      /* a browser that refuses to say: status() will report what it knows */
    }
  }
  return status();
}

export function status() {
  return {
    canPrompt: !!deferredPrompt,
    standalone: standalone(),
    sw: !!registration,
    waiting: !!registration?.waiting,
    installing: !!registration?.installing,
    secure: !!window.isSecureContext,
  };
}

/** Re-render hook: fires whenever the status above could have changed. */
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function onUpdateReady(fn) {
  readyCbs.add(fn);
  return () => readyCbs.delete(fn);
}

function notify() {
  const s = status();
  for (const fn of [...subs]) {
    try { fn(s); } catch { /* the view that subscribed is gone */ }
  }
}

/**
 * Shows the browser's own install dialog. Resolves to "accepted", "dismissed"
 * or "unavailable" (no prompt offered - on iOS that is normal, not an error).
 */
export async function installNow() {
  if (!deferredPrompt) return "unavailable";
  deferredPrompt.prompt();
  let outcome = "dismissed";
  try {
    outcome = (await deferredPrompt.userChoice)?.outcome || "dismissed";
  } catch {
    /* the user walked away before choosing */
  }
  if (outcome === "accepted") deferredPrompt = null;
  notify();
  return outcome;
}

/**
 * Ask the browser to re-check the registered scope. Returns "ready" when a new
 * build is waiting, "current" when this is already the newest build, and
 * "unavailable" when there is no worker to ask (a `file://` open, or the
 * registration failed because the origin is not secure).
 */
export async function checkForUpdate({ waitMs = 4000 } = {}) {
  if (!registration) return "unavailable";
  try { await registration.update(); } catch { return "unreachable"; }
  let waited = 0;
  while (registration.installing && !registration.waiting && waited < waitMs) {
    await sleep(150);
    waited += 150;
  }
  notify();
  return registration.waiting ? "ready" : "current";
}

/**
 * Let the waiting build take over, then reload once the browser has actually
 * swapped controllers - reloading a moment too early would run the old build
 * again and look like the button did nothing.
 */
export async function applyUpdate() {
  const sw = registration?.waiting;
  if (!sw) return false;
  sw.postMessage({ type: "skip-waiting" });
  await new Promise((res) => {
    const done = () => { clearTimeout(timer); res(); };
    const timer = setTimeout(done, 1500);
    navigator.serviceWorker?.addEventListener?.("controllerchange", done, { once: true });
  });
  location.reload();
  return true;
}
