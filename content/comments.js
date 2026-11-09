/**
 * TL;DR: Too Long; Didn't Read (the comments).
 *
 * Sibling to TL;DW but for YouTube COMMENTS only: scrape the top comments, send
 * them to the background for a Gemini sentiment read, and inject a compact card
 * above the comments, same visual language as the TL;DW summary panel.
 *
 * SPA-safe (YouTube rewrites the page on navigation): idempotent mount keyed to
 * the current video id, re-resolved on every nav. Results are cached per video.
 */

const log = (...a) => console.log("[TL;DR]", ...a);
const PANEL_ID = "tldr-comments-panel";
const CACHE_KEY = "commentCache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // comments move faster than videos, so 1 day
const CACHE_MAX = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function videoId() {
  try {
    return new URLSearchParams(location.search).get("v") || "";
  } catch {
    return "";
  }
}

function isWatchPage() {
  return location.pathname === "/watch" && !!videoId();
}

async function loadSettings() {
  const r = await chrome.storage.local.get("settings");
  return r.settings || {};
}

// --- per-video result cache ------------------------------------------------

async function getCached(vid) {
  const r = await chrome.storage.local.get(CACHE_KEY);
  const cache = r[CACHE_KEY] || {};
  const e = cache[vid];
  if (!e) return null;
  if (Date.now() - new Date(e.at).getTime() > CACHE_TTL_MS) return null;
  return e;
}

async function setCached(vid, sentiment, audienceScore) {
  const r = await chrome.storage.local.get(CACHE_KEY);
  const cache = r[CACHE_KEY] || {};
  cache[vid] = { sentiment, audienceScore, at: new Date().toISOString() };
  // Prune: TTL + count cap.
  const now = Date.now();
  for (const id of Object.keys(cache)) {
    if (now - new Date(cache[id].at).getTime() > CACHE_TTL_MS) delete cache[id];
  }
  const ids = Object.keys(cache);
  if (ids.length > CACHE_MAX) {
    ids
      .sort((a, b) => new Date(cache[b].at).getTime() - new Date(cache[a].at).getTime())
      .slice(CACHE_MAX)
      .forEach((id) => delete cache[id]);
  }
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

// --- comment scraping ------------------------------------------------------

/** Read up to 20 top comments as a formatted string, or null if none rendered. */
async function scrapeComments() {
  const deadline = Date.now() + 4000;
  let threads = document.querySelectorAll("ytd-comment-thread-renderer");
  while (threads.length === 0 && Date.now() < deadline) {
    await sleep(150);
    threads = document.querySelectorAll("ytd-comment-thread-renderer");
  }
  if (threads.length === 0) return null;

  const out = [];
  const limit = Math.min(threads.length, 20);
  for (let i = 0; i < limit; i++) {
    const thread = threads[i];
    const textEl =
      thread.querySelector("#content-text") ||
      thread.querySelector("yt-attributed-string") ||
      thread.querySelector(".ytd-comment-renderer");
    const text = textEl && textEl.textContent ? textEl.textContent.trim().replace(/\s+/g, " ") : "";
    if (!text) continue;
    const likeEl =
      thread.querySelector("#vote-count-middle") || thread.querySelector("span[aria-label]");
    const likes = likeEl && likeEl.textContent ? likeEl.textContent.trim() : "";
    out.push(likes ? `${text} [${likes} likes]` : text);
  }
  return out.length > 0 ? out.join("\n") : null;
}

// --- panel ------------------------------------------------------------------

function theme() {
  const dark =
    document.documentElement.getAttribute("dark") !== null ||
    matchMedia("(prefers-color-scheme: dark)").matches;
  return dark
    ? { bg: "#212121", border: "#3f3f3f", text: "#f1f1f1", sub: "#aaa", hover: "#383838" }
    : { bg: "#fff", border: "#e5e5e5", text: "#0f0f0f", sub: "#606060", hover: "#f2f2f2" };
}

function scoreVerdict(score) {
  if (score === undefined || score === null) return { label: "", color: "#606060" };
  if (score >= 7) return { label: "POSITIVE", color: "#16a34a" };
  if (score >= 4) return { label: "MIXED", color: "#d97706" };
  return { label: "NEGATIVE", color: "#dc2626" };
}

function panelHost() {
  const comments = document.querySelector("ytd-comments#comments");
  if (comments && comments.parentElement) {
    return { container: comments.parentElement, ref: comments };
  }
  return null;
}

function removePanel() {
  const el = document.getElementById(PANEL_ID);
  if (el) el.remove();
}

function makePanel(t) {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    background: t.bg,
    border: `1px solid ${t.border}`,
    borderRadius: "12px",
    padding: "10px 14px",
    marginBottom: "14px",
    font: "14px/1.4 Roboto, system-ui, sans-serif",
    color: t.text,
  });
  return panel;
}

function header(t, rightEls) {
  const head = document.createElement("div");
  Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" });
  const icon = document.createElement("img");
  icon.src = chrome.runtime.getURL("icons/icon-32.png");
  Object.assign(icon.style, { width: "26px", height: "26px", borderRadius: "6px", flexShrink: "0" });
  const title = document.createElement("span");
  title.textContent = "TL;DR";
  Object.assign(title.style, { fontWeight: "700", fontSize: "15px", color: t.text, flexShrink: "0" });
  const tag = document.createElement("span");
  tag.textContent = "the comments";
  Object.assign(tag.style, { fontSize: "12px", color: t.sub, flexShrink: "0" });
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  head.append(icon, title, tag, spacer, ...(rightEls || []));
  return head;
}

function pill(text, bg, color) {
  const el = document.createElement("span");
  el.textContent = text;
  Object.assign(el.style, {
    background: bg,
    color,
    fontWeight: "700",
    fontSize: "11px",
    letterSpacing: "0.05em",
    padding: "3px 10px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
  });
  return el;
}

function linkBtn(t, text, onClick) {
  const b = document.createElement("button");
  b.textContent = text;
  Object.assign(b.style, {
    background: "transparent",
    border: "none",
    color: t.sub,
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "700",
    padding: "0",
    whiteSpace: "nowrap",
  });
  b.addEventListener("mouseenter", () => (b.style.color = t.text));
  b.addEventListener("mouseleave", () => (b.style.color = t.sub));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(b);
  });
  return b;
}

function actionPill(t, text, onClick) {
  const b = document.createElement("button");
  b.textContent = text;
  Object.assign(b.style, {
    background: "#0d9488",
    color: "#fff",
    border: "none",
    borderRadius: "999px",
    padding: "6px 16px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(b);
  });
  return b;
}

function mountPanel(panel) {
  const host = panelHost();
  if (!host) return false;
  removePanel();
  host.container.insertBefore(panel, host.ref);
  return true;
}

function showSetup(t) {
  const panel = makePanel(t);
  const openBtn = linkBtn(t, "Add a free key →", () =>
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }),
  );
  const head = header(t, [openBtn]);
  const msg = document.createElement("div");
  msg.textContent =
    "Add a free Gemini API key to read the room: instant AI sentiment of this video's comments.";
  Object.assign(msg.style, { fontSize: "13px", color: t.sub, marginTop: "8px" });
  panel.append(head, msg);
  mountPanel(panel);
}

function showIdle(t, onRun) {
  const panel = makePanel(t);
  const runBtn = actionPill(t, "Read the comments", () => onRun());
  panel.append(header(t, [runBtn]));
  mountPanel(panel);
}

function showLoading(t) {
  const panel = makePanel(t);
  const analyzing = document.createElement("span");
  analyzing.textContent = "Reading the comments…";
  Object.assign(analyzing.style, { fontSize: "12px", color: t.sub });
  panel.append(header(t, [analyzing]));
  mountPanel(panel);
}

function showResult(t, sentiment, audienceScore, onReRun) {
  const panel = makePanel(t);
  const v = scoreVerdict(audienceScore);
  const right = [];
  if (v.label) right.push(pill(v.label, v.color, "#fff"));
  right.push(linkBtn(t, "↻", () => onReRun()));
  const head = header(t, right);
  const body = document.createElement("div");
  body.textContent = sentiment || "No clear sentiment.";
  Object.assign(body.style, { fontSize: "13px", lineHeight: "1.5", color: t.text, marginTop: "8px" });
  panel.append(head, body);
  mountPanel(panel);
}

function showError(t, message, onRetry) {
  const panel = makePanel(t);
  const retry = linkBtn(t, "Try again", () => onRetry());
  const head = header(t, [retry]);
  const body = document.createElement("div");
  body.textContent = message;
  Object.assign(body.style, { fontSize: "13px", color: t.sub, marginTop: "8px" });
  panel.append(head, body);
  mountPanel(panel);
}

// --- run --------------------------------------------------------------------

let running = false;

async function analyze(vid) {
  if (running) return;
  running = true;
  const t = theme();
  showLoading(t);
  try {
    const comments = await scrapeComments();
    if (!comments) {
      showError(t, "Couldn't find comments to read (they may be turned off).", () => analyze(vid));
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "ANALYZE_COMMENTS", comments, videoId: vid });
    if (currentVid !== vid) return; // navigated away mid-call
    if (!res || res.error) {
      showError(t, (res && res.error) || "Couldn't analyze the comments.", () => analyze(vid));
      return;
    }
    await setCached(vid, res.sentiment, res.audienceScore);
    showResult(t, res.sentiment, res.audienceScore, () => analyze(vid));
  } catch (e) {
    showError(theme(), "Something went wrong reading the comments.", () => analyze(vid));
  } finally {
    running = false;
  }
}

// --- navigation + comments-section detection --------------------------------

let currentVid = "";
let armed = false; // have we set up the panel for this video yet?
let io = null;

async function setup() {
  const vid = videoId();
  if (currentVid !== vid) {
    currentVid = vid;
    armed = false;
    removePanel();
    if (io) {
      io.disconnect();
      io = null;
    }
  }
  if (!isWatchPage() || armed) return;
  if (!panelHost()) return; // comments section not in the DOM yet

  armed = true;
  const t = theme();
  const settings = await loadSettings();
  if (currentVid !== vid) return;

  if (!settings.geminiApiKey) {
    showSetup(t);
    return;
  }

  const cached = await getCached(vid);
  if (currentVid !== vid) return;
  if (cached) {
    showResult(t, cached.sentiment, cached.audienceScore, () => analyze(vid));
    return;
  }

  if (settings.autoAnalyze) {
    // Don't force-scroll; analyze once the comments scroll into view naturally.
    const target = document.querySelector("ytd-comments#comments");
    if (target && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            io = null;
            void analyze(vid);
          }
        },
        { rootMargin: "200px" },
      );
      io.observe(target);
    } else {
      void analyze(vid);
    }
  } else {
    showIdle(t, () => analyze(vid));
  }
}

void setup();
window.addEventListener("yt-navigate-finish", () => void setup());
setInterval(() => void setup(), 800);
