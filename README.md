# TL;DR: Comment Sentiment for YouTube

**Too Long; Didn't Read (the comments).**
A sibling to [TL;DW](https://github.com/n8watkins/tl-dw), but for the *comments*: it reads a video's top comments, sends them to the Gemini API for a quick sentiment read, and shows a compact card above the comment section.

There is no build step: it's a plain Manifest V3 Chrome extension you can load as-is.

## Install (unpacked)

1. Get a free Gemini key at <https://aistudio.google.com/apikey> (Create API key; no card, no billing).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick this folder.
3. Open the extension's **Options** and paste your key.
4. Open any YouTube video and scroll to the comments: the **TL;DR** card appears.

## Settings (Options page)

- **Gemini API key**: stored only in your browser, sent only to Google.
- **Auto-read on every video**: analyze automatically when the comments scroll into view.
  Off shows a "Read the comments" button instead.
- **Comment prompt**: editable; `{{comments}}` is where the comments go.
  End it with an `Audience score: X/10` line to drive the POSITIVE/MIXED/NEGATIVE pill.

## How it works

- `content/comments.js`: SPA-safe injection; reads up to 20 top comments, shows the card, and caches results per video (1-day TTL, 200-entry cap).
- `background/worker.js`: calls Gemini (`gemini-3.1-flash-lite`) and parses the sentiment and score.
  Host permissions let it call the API without CORS issues.
- `options/`: key, behavior, prompt, and a small usage counter.

## Relationship to TL;DW

This is intentionally separate: TL;DW summarizes the *video*; TL;DR reads the *comments*.
The comment reading, Gemini call and sentiment parsing were ported from TL;DW's comment feature and trimmed to stand alone.

## License

MIT, see [LICENSE](LICENSE).
