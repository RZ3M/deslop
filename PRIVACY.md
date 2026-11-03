# Deslop privacy policy

*Effective November 3, 2026*

Deslop is a browser extension that hides low-quality posts ("slop") on X, LinkedIn and Reddit. This policy explains what data Deslop handles, where it goes and how you control it. In short: **Deslop has no server of its own, collects no analytics and never sells your data.** The only data that leaves your browser is the post text sent to the model that judges it, and the account lookups described below.

## What Deslop sends, and to whom

### Posts you scroll past, to the model you chose

To decide whether to hide a post, Deslop sends it to a decision model. For each post it sends:

- the author's display name and handle (X), name and headline (LinkedIn) or username (Reddit)
- the post's text (on Reddit, its title and the excerpt shown in the feed, or a comment's text), and the text of any post it quotes
- on Reddit, the community it was posted in and whether it's a comment
- the text of a link preview, and whether the post has an image or video (not the image or video itself)
- the questions for the filters you turned on, including the wording of your custom rules and focus interests

Where this goes depends on your settings:

- **OpenRouter (default).** Requests go to [OpenRouter](https://openrouter.ai), which passes them to the company that runs the model you picked (TypeSafe for Jev, the default). Their handling of this data is covered by [OpenRouter's privacy policy](https://openrouter.ai/privacy) and by that provider's terms.
- **Your own server.** Requests go only to the server address you enter, and nowhere else.

Deslop doesn't send your own posts, messages, notifications, profile, browsing history or anything else from the page.

### Account locations, to X and LinkedIn

If you use the country filter, Deslop looks up where post authors are based:

- **X:** it requests the account's "About this account" data from x.com, the same request x.com makes when you open that page.
- **LinkedIn:** it loads the first part of the author's public profile page from linkedin.com. **LinkedIn may count this as a profile view.**

These requests come from your browser, using your existing login, and go only to the site you're already on. If a location can't be matched in code (for example "Golden Horseshoe"), the location text and the names of the countries you blocked are sent to the model, as above.

### Author profiles, to Reddit

If **Hide OnlyFans & porn-bot accounts** or **Hide brand-new NSFW accounts** is on (both are by default), Deslop looks at the profile of each Reddit post's author, and of commenters if you turn on **Check commenters' profiles too**:

- it requests the author's `about.json` from reddit.com, for the account's age, whether its profile is marked NSFW, and its bio
- it loads the author's profile page from reddit.com, for the links they added to their profile and whether they hide their posts

These requests come from your browser, using your existing login, and go only to reddit.com. Reddit doesn't tell people who viewed their profile. What Deslop keeps from a profile is listed below; profiles are never sent to the model.

### "Not interested" feedback on X

If you turn on **Tell X you're not interested**, Deslop clicks X's own *Not interested in this post* menu item for posts it hides, so X receives the same signal as if you'd clicked it yourself. It's off by default.

### Connecting OpenRouter

If you click **Connect OpenRouter**, OpenRouter opens in a window where you sign in to OpenRouter, not to Deslop. OpenRouter then creates an API key named "Deslop" in your account and gives it to the extension. Deslop never sees your OpenRouter password. You can revoke the key at any time in your [OpenRouter key settings](https://openrouter.ai/settings/keys).

## What Deslop stores in your browser

| Data | Where | How long |
| --- | --- | --- |
| API keys (OpenRouter, and your server's key if it needs one) | `chrome.storage.local` on this device, never synced | Until you remove them or uninstall |
| Settings: filters, strictness, custom rules, muted words, allowlist, focus interests, blocked countries, model and server address, spending cap | `chrome.storage.sync`, which Chrome syncs between your own browsers if you have Chrome sync on | Until you change them or uninstall |
| The model's answers for posts you've seen (keyed by post, not stored as post text) | `chrome.storage.local` | 14 days |
| Account locations | `chrome.storage.local` | 45 days |
| Reddit profile facts: account age, karma, NSFW flag, whether posts are hidden, the bio, and only those profile links that point to adult platforms or link-in-bio pages | `chrome.storage.local` | 14 days |
| Your 60 most recently hidden posts (author, a short snippet and the reason), shown in the popup | `chrome.storage.local` | Until newer hidden posts replace them |
| Counts of posts hidden and checked, and today's and total spend | `chrome.storage.local` | Until you uninstall |
| Only if you turn on **Keep a history**: per day, counts of posts hidden by site and filter, posts checked by site, and spend (counts only, no post text, authors or links) | `chrome.storage.local` | 90 days, or until you turn it off, which deletes it |

None of this is sent to the Deslop developers. **Clear cached verdicts** in the settings page removes the cached answers, locations and Reddit profiles. Uninstalling Deslop removes everything it stored.

## What Deslop doesn't do

- No analytics, telemetry, tracking or crash reporting.
- No ads, and no selling, renting or sharing of your data with anyone except the model provider you chose, and only to judge posts.
- No use of your data for anything other than filtering your feed. In particular, your data isn't used for creditworthiness, lending, advertising or training models by the Deslop developers.

Deslop's use of information follows the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including its Limited Use requirements.

## Permissions

- **storage:** to keep your settings, keys and caches.
- **identity:** only to open OpenRouter's sign-in window when you click **Connect OpenRouter**.
- **Access to x.com, twitter.com, linkedin.com and www.reddit.com:** to read and hide posts in your feed, and for the location and profile lookups above.
- **Access to openrouter.ai:** to send posts to the model and load the list of available models.
- **Access to your own server (optional):** asked for only when you set up a self-hosted server and click **Save & test**, and only for that server's host.

## Children

Deslop isn't directed at children under 13 and doesn't knowingly collect their data.

## Changes

Changes to this policy are published in this file, with a new effective date. The full history is in the [repository](https://github.com/RZ3M/deslop/commits/main/PRIVACY.md).

## Contact

Questions or requests: [open an issue on GitHub](https://github.com/RZ3M/deslop/issues).
