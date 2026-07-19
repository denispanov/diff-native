import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(file);
    } else if (entry.name === 'word-helpers.js') {
      const source = await readFile(file, 'utf8');
      const exports = [...source.matchAll(/^export function (\w+)/gm)].map(match => match[1]);
      const commonJs = `${source.replaceAll(/^export function /gm, 'function ')}\nmodule.exports = { ${exports.join(', ')} };\n`;
      await writeFile(file, commonJs);
    }
  }
}

await visit(process.argv[2]);
