/**
 * TL;DR background worker. The content script scrapes a video's top comments and
 * sends them here; we call the Gemini API (host_permissions bypass CORS), parse
 * the sentiment + a 1-10 audience score, and send the result back to inject.
 *
 * Ported from the TL;DW extension's comment-sentiment path, trimmed to just
 * comments. Needs a free Gemini API key (aistudio.google.com/apikey).
 */

const MODEL = "gemini-3.1-flash-lite";

const DEFAULT_PROMPT =
  "These are the top viewer comments on this YouTube video. In 2-3 sentences, " +
  "summarize the overall audience sentiment: what people liked, disliked, or " +
  "are debating. If multiple commenters mention specific timestamps or moments, " +
  "include those. Be specific and don't invent anything. End your response with " +
  'exactly one line in this format: "Audience score: X/10" (10 = overwhelmingly ' +
  "positive, 1 = overwhelmingly negative).\n\nComments:\n{{comments}}";

async function callGemini(prompt, apiKey) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODEL +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error((err && err.error && err.error.message) || "HTTP " + res.status);
  }
  const data = await res.json();
  const text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

/** Bump the lightweight usage counter (today + all-time). */
async function bumpUsage() {
  const r = await chrome.storage.local.get("usage");
  const usage = r.usage || { allTime: 0, today: 0, todayDate: "" };
  const todayDate = new Date().toISOString().slice(0, 10);
  const today = usage.todayDate === todayDate ? usage.today + 1 : 1;
  await chrome.storage.local.set({
    usage: { allTime: (usage.allTime || 0) + 1, today, todayDate, lastAt: new Date().toISOString() },
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "ANALYZE_COMMENTS") {
    void (async () => {
      try {
        const r = await chrome.storage.local.get("settings");
        const settings = r.settings || {};
        const apiKey = (settings.geminiApiKey || "").trim();
        if (!apiKey) {
          sendResponse({ error: "No Gemini API key set. Open the extension options to add one." });
          return;
        }
        const template = settings.commentPrompt || DEFAULT_PROMPT;
        const prompt = template.replace(/\{\{\s*comments\s*\}\}/g, message.comments || "");
        const text = await callGemini(prompt, apiKey);
        void bumpUsage();

        const scoreMatch = /Audience score:\s*(\d+)\/10/i.exec(text);
        const audienceScore = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;
        const sentiment = text
          .replace(/^.*Audience score:\s*\d+\/10.*$/im, "")
          .trim();
        sendResponse({ sentiment, audienceScore });
      } catch (e) {
        sendResponse({ error: (e && e.message) || "Failed to analyze comments" });
      }
    })();
    return true; // async response
  }
  if (message && message.type === "OPEN_OPTIONS") {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
