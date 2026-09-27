// Copies the browser builds of the export libraries into public/vendor, so they are
// served as static files: by Express when running locally, by the CDN on Vercel.
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  'mediabunny.mjs': 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs',
  'gifenc.mjs': 'node_modules/gifenc/dist/gifenc.esm.js',
};

mkdirSync(path.join(root, 'public/vendor'), { recursive: true });
for (const [name, source] of Object.entries(files)) {
  copyFileSync(path.join(root, source), path.join(root, 'public/vendor', name));
}
