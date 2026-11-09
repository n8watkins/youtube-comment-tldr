/** TL;DR options page. Plain JS, no build step. Reads/writes chrome.storage.local. */

const DEFAULT_PROMPT =
  "These are the top viewer comments on this YouTube video. In 2-3 sentences, " +
  "summarize the overall audience sentiment: what people liked, disliked, or " +
  "are debating. If multiple commenters mention specific timestamps or moments, " +
  "include those. Be specific and don't invent anything. End your response with " +
  'exactly one line in this format: "Audience score: X/10" (10 = overwhelmingly ' +
  "positive, 1 = overwhelmingly negative).\n\nComments:\n{{comments}}";

async function getSettings() {
  const r = await chrome.storage.local.get("settings");
  return r.settings || {};
}

async function patchSettings(patch) {
  const settings = await getSettings();
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
}

function renderKey(settings) {
  const area = document.getElementById("keyArea");
  area.innerHTML = "";
  if (settings.geminiApiKey) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;";
    const ok = document.createElement("span");
    ok.textContent = "✓ Key saved";
    ok.style.fontWeight = "700";
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete key";
    del.addEventListener("click", async () => {
      await patchSettings({ geminiApiKey: "" });
      renderKey(await getSettings());
    });
    wrap.append(ok, del);
    area.append(wrap);
  } else {
    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Paste your Gemini API key";
    input.autocomplete = "new-password";
    input.spellcheck = false;
    const save = document.createElement("button");
    save.textContent = "Save key";
    save.style.marginTop = "12px";
    save.addEventListener("click", async () => {
      const v = input.value.trim();
      if (!v) return;
      await patchSettings({ geminiApiKey: v });
      renderKey(await getSettings());
    });
    area.append(input, save);
  }
}

async function renderUsage() {
  const r = await chrome.storage.local.get("usage");
  const usage = r.usage || {};
  const today = usage.todayDate === new Date().toISOString().slice(0, 10) ? usage.today || 0 : 0;
  document.getElementById("usageAll").textContent = usage.allTime || 0;
  document.getElementById("usageToday").textContent = today;
}

async function init() {
  const settings = await getSettings();
  renderKey(settings);

  const auto = document.getElementById("autoAnalyze");
  auto.checked = !!settings.autoAnalyze;
  auto.addEventListener("change", () => void patchSettings({ autoAnalyze: auto.checked }));

  const prompt = document.getElementById("prompt");
  prompt.value = settings.commentPrompt || DEFAULT_PROMPT;
  document.getElementById("savePrompt").addEventListener("click", async () => {
    await patchSettings({ commentPrompt: prompt.value });
    const s = document.getElementById("promptSaved");
    s.hidden = false;
    setTimeout(() => (s.hidden = true), 1500);
  });
  document.getElementById("resetPrompt").addEventListener("click", async () => {
    prompt.value = DEFAULT_PROMPT;
    await patchSettings({ commentPrompt: DEFAULT_PROMPT });
  });

  await renderUsage();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.usage) void renderUsage();
  });
}

void init();
