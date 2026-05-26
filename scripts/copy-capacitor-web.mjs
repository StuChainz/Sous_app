import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'www');
const staticEntries = ['index.html', 'css', 'js', 'assets', 'sw.js'];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const entry of staticEntries) {
  const src = join(root, entry);
  if (!existsSync(src)) continue;
  cpSync(src, join(outDir, entry), { recursive: true });
}
