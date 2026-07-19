import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const snippetsRoot = new URL('../dist/node/snippets/', import.meta.url);
for (const directory of await readdir(snippetsRoot)) {
  const boundaryPath = join(snippetsRoot.pathname, directory, 'src/patch-boundary.js');
  let source;
  try {
    source = await readFile(boundaryPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const exports = [...source.matchAll(/^export function (\w+)/gm)].map(match => match[1]);
  source = source.replace(/^export function /gm, 'function ');
  source += `\nmodule.exports = { ${exports.join(', ')} };\n`;
  await writeFile(boundaryPath, source);
}
