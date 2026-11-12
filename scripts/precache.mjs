import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const assets = (await readdir(new URL('assets/', dist))).sort().map(name => join('/assets', name).replaceAll('\\', '/'));
const paths = ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', ...assets];
const hash = createHash('sha256');
for (const path of [...paths, '/sw.js']) {
  hash.update(path);
  hash.update(await readFile(new URL(path.slice(1), dist)));
}
const target = new URL('sw.js', dist);
const worker = await readFile(target, 'utf8');
const placeholder = /\/\* generated-precache \*\/ \{[^\n]+\}/;
if (!placeholder.test(worker)) throw new Error('Missing service worker precache declaration.');
await writeFile(target, worker.replace(placeholder, JSON.stringify({ version: hash.digest('hex').slice(0, 16), paths })));
