<p align="center"><img src="icons/icon128.png" width="84" alt="Deslop icon"></p>

<h1 align="center">Deslop</h1>

<p align="center"><b>A Chrome extension that removes slop from X and LinkedIn.</b><br>
Engagement bait, AI-written filler, recycled news, clickbait hooks, broetry and, if you want, posts from countries you choose, quietly disappear from your feed.<br>
Every post is judged by <a href="https://openrouter.ai/~typesafe/jev-latest">Jev</a>, TypeSafe's decision model, through OpenRouter.</p>

<p align="center">
  <img src="docs/timeline.png" width="420" alt="An X timeline with three slop posts replaced by Deslop placeholders">
  &nbsp;
  <img src="docs/popup.png" width="300" alt="The Deslop popup: stats, strictness and recently hidden posts">
</p>

<p align="center"><sub>Placeholder mode shown so you can see what was caught. By default, slop is removed completely.</sub></p>

## What it hides

| Category | Examples | Default |
| --- | --- | --- |
| **Engagement bait** | "The prompt is in the replies 👇", "Comment GUIDE and I'll DM you", "Link in first comment", "Like if you agree" | On |
| **AI-generated writing** | "In today's fast-paced landscape…", "It's not X, it's Y", emoji-bullet listicles, "Let that sink in" | On |
| **Recycled news** | "🚨 OpenAI just dropped… here's everything you need to know 🧵", weekly "AI news you missed" roundups | On |
| **Clickbait hooks** | "RIP Photoshop", "This changes everything", "99% of people don't know this" | On |
| **Broetry & humblebrags** | "Yesterday I fired my best employee. Here's why." | On |
| **Rage bait** | Inflammatory hot takes written to farm angry replies | Off |
| **Your own rules** | Anything you describe in plain English, e.g. *"Crypto or memecoin promotion"* | — |
| **Countries / regions** | Accounts based in countries or regions you pick | — |

Plus muted words, an allowlist of accounts that are never hidden, and optional hiding of promoted posts.

## How it works

Jev isn't a chat model. It answers **typed questions** about a piece of text and returns **calibrated probabilities** (`noul` for yes/no, `score` for a graded scale, `choice` for picking an option) in about 100–400 ms.

Deslop asks Jev seven narrow questions about every post in **one request**:

```
withholds_payoff    noul   Does the post hold back its point and push you to the replies/DMs/a thread?
engagement_farming  noul   Is it mainly fishing for likes, reposts, follows or comments?
ai_style            score  How strongly does the writing show ChatGPT-style tells? (0 human … 3 unmistakable)
news_rehash         noul   Is it secondhand news turned into a recap or hype post, adding nothing new?
clickbait_hook      noul   Does it open with a hype or curiosity-gap hook that overpromises?
hollow_inspiration  noul   Is it a formulaic "lessons learned" story or humblebrag?
rage_bait           noul   Is it built to provoke outrage for engagement?
```

The answers are combined in code (`src/lib/questions.js`). A post is hidden when any enabled category passes the threshold for your strictness level:

| Strictness | Hides at | AI-writing score |
| --- | --- | --- |
| Relaxed | ≥ 90 % | ≥ 0.80 |
| **Balanced** (default) | ≥ 80 % | ≥ 0.67 ("likely AI") |
| Strict | ≥ 65 % | ≥ 0.55 |

Raw answers are cached per post for 14 days, so changing strictness or toggling categories never calls the model again. Posts are blurred for the fraction of a second it takes to check them, so slop doesn't flash on screen.

**Cost:** about **$0.0001 per post** (≈2,300 input tokens at $0.042/M). Scrolling past 1,000 new posts costs about ten cents. Today's spend is shown in the popup.

### Country filter

- **X** shows an *"Account based in"* line on every account's *About this account* page. Deslop reads the same data x.com loads for that page, from your logged-in tab, once per account (cached for 45 days). X allows roughly 50 of these lookups per 15 minutes; Deslop respects the rate-limit headers, so a brand-new feed fills in gradually. Some accounts only disclose a region (e.g. "South Asia"). Enable *Also hide region-only accounts* to hide those when the region contains a country you blocked.
- **LinkedIn** doesn't show location in the feed, so Deslop reads the location line from the author's profile page (streaming only the first ~60 KB, at most 300 profiles a day, cached for 45 days). ⚠️ **LinkedIn may count this as a profile view.** If you don't want to show up in "Who viewed your profile", switch LinkedIn's profile viewing mode to private, or turn off *Apply on LinkedIn*.
- Places like "Toronto, Ontario, Canada" are matched in code. Vague ones like "Greater Chennai Area" or "Atlanta, Georgia" are resolved by asking Jev which of *your blocked countries* (if any) the place is in.
- Lookups only run for posts that pass the slop check, so hidden posts never cost a lookup.

## Install

1. Download `deslop-<version>.zip` from [Releases](https://github.com/RZ3M/deslop/releases) and unzip it, or clone this repo.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. The settings page opens. Paste an [OpenRouter API key](https://openrouter.ai/settings/keys) and click **Save & test**.
5. Scroll X or LinkedIn.

Works in Chrome, Edge, Brave, Arc and other Chromium browsers (Manifest V3, Chrome 111+).

<details>
<summary><b>Developer shortcut: use a key from a <code>.env</code> file</b></summary>

```powershell
pwsh scripts/import-env-key.ps1   # reads OPENROUTER_API_KEY from ./.env or ../.env
```

This writes `config.local.json` (gitignored). The unpacked extension imports it on first run, so you don't need to paste the key.
</details>

<p align="center"><img src="docs/options.png" width="640" alt="Deslop settings page"></p>

## Privacy

- **Post text goes to OpenRouter/TypeSafe** to be classified: the author's display name and handle or headline, the post text, any quoted post, and whether it has media. Nothing else from the page is sent.
- Your **API key** stays in `chrome.storage.local` and is only sent to `openrouter.ai`.
- Verdicts, account locations and stats are stored **locally** in your browser. There's no Deslop server, analytics or telemetry.
- Country lookups use your own logged-in X/LinkedIn session from the tab you're browsing, just like opening the About or profile page yourself (see the LinkedIn profile-view note above).

## Development

No build step. It's plain ES modules and Manifest V3.

```
manifest.json
src/
  background.js          service worker: classification, caching, country resolution, stats
  lib/questions.js       ★ every Jev question and threshold, in one place
  lib/classify.js        post → Jev state, answers → verdict (pure, testable)
  lib/jev.js             OpenRouter Decisions API client (retries, concurrency limit)
  lib/countries.js       countries, regions, place matching
  lib/settings.js, cache.js
  content/common.js      engine: scan, blur, hide/collapse, country check
  content/x.js           X adapter + "Account based in" lookups
  content/x-main-world.js  learns X's current AboutAccountQuery id from x.com's own requests
  content/linkedin.js    LinkedIn adapter + profile-location lookups
  popup/, options/, ui/  extension UI
tests/                   browser-based tests (see below)
scripts/                 serve.ps1, import-env-key.ps1, make-icons.ps1, package.ps1
```

### Tests

```powershell
pwsh scripts/import-env-key.ps1          # tests that call Jev need config.local.json
pwsh scripts/serve.ps1                   # http://localhost:8787
```

| Page | What it checks | Status |
| --- | --- | --- |
| `/tests/unit.html` | Place matching, blocking rules, verdict composition, custom rules, limiter (offline) | 18/18 |
| `/tests/harness.html` | 33 labelled posts through the live model, at each strictness | 33/33 at Balanced |
| `/tests/e2e-x.html` | Real `background.js` + content scripts on a mock X timeline, live Jev | 9/9 |
| `/tests/e2e-linkedin.html` | Same for LinkedIn, including profile-location parsing and author detection | 9/9 |
| `/src/popup/popup.html?shim` | Preview extension pages in a normal tab | — |

The extension was also loaded unpacked in a real Chromium browser and run against a mock `x.com` timeline, with the real content scripts, service worker and Jev.

### Tuning

If Deslop is too aggressive or too lenient on your feed, edit the wording, examples or thresholds in [`src/lib/questions.js`](src/lib/questions.js), add a labelled case to [`tests/fixtures.js`](tests/fixtures.js) and re-run the harness. Following TypeSafe's guidance, keep questions atomic: one judgment per question, combined in code.

## Known limitations

- X and LinkedIn change their markup often. The adapters rely on `data-testid`s, roles and profile URLs rather than CSS classes, but a redesign can still break them.
- X occasionally rotates the id of its `AboutAccountQuery`. Deslop learns the new one when you open any account's *About* page.
- Windows doesn't render flag emoji, so countries show as two-letter codes there.
- Text-only: images and videos aren't analysed (Jev is a text model). Posts with fewer than three words are left alone.

## License

[MIT](LICENSE)
