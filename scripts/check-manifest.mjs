// Sanity checks that would otherwise only fail at "Load unpacked" or store
// upload time. Prints the version on success.
//   node scripts/check-manifest.mjs
import { readFileSync, existsSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
const errors = [];

if (!/^\d+(\.\d+){0,3}$/.test(manifest.version || '')) errors.push(`version "${manifest.version}" must be 1–4 dot-separated integers`);
if ((manifest.description || '').length > 132) errors.push(`description is ${manifest.description.length} characters; Chrome allows 132`);
if ((manifest.short_name || '').length > 12) errors.push(`short_name is longer than 12 characters`);

const files = [
  ...Object.values(manifest.icons || {}),
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
for (const f of files) if (!existsSync(new URL(`../${f}`, import.meta.url))) errors.push(`missing file: ${f}`);

if (errors.length) {
  console.error(errors.map((e) => `manifest.json: ${e}`).join('\n'));
  process.exit(1);
}
console.log(manifest.version);
