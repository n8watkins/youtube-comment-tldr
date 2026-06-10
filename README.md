# TL;DR — Comment Sentiment for YouTube

**Too Long; Didn't Read (the comments).** A sibling to TL;DW, but for the *comments*:
it scrapes a video's top comments, sends them to the Gemini API for a quick
sentiment read, and injects a compact card above the comment section.

No build step — it's a plain MV3 extension you can load as-is.

## Install (unpacked)

1. Get a free Gemini key: <https://aistudio.google.com/apikey> → Create API key
   (no card, no billing).
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick
   this folder (`tldr-comments`).
3. Open the extension's **Options**, paste your key.
4. Open any YouTube video and scroll to the comments — the **TL;DR** card appears.

## Settings (Options page)

- **Gemini API key** — stored only in your browser, sent only to Google.
- **Auto-read on every video** — analyze automatically when the comments scroll
  into view. Off → a "Read the comments" button instead.
- **Comment prompt** — editable; `{{comments}}` is where the scraped comments go.
  End it with an `Audience score: X/10` line to drive the POSITIVE/MIXED/NEGATIVE
  pill.

## How it works

- `content/comments.js` — SPA-safe injection; scrapes up to 20 top comments,
  shows the card, caches results per video (1-day TTL, 200-entry cap).
- `background/worker.js` — calls Gemini (`gemini-3.1-flash-lite`), parses the
  sentiment + score. Host permissions let it call the API without CORS issues.
- `options/` — key, behavior, prompt, and a small usage counter.

## Relationship to TL;DW

This is intentionally separate: TL;DW summarizes the *video*; TL;DR reads the
*comments*. The comment-scraping, Gemini call, and sentiment parsing were ported
from TL;DW's (Direct-API-only) comment feature and trimmed to stand alone.
