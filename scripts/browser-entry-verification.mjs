import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffChars as referenceDiffChars } from 'diff';

const candidates = [
  process.env.BROWSER_BIN,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

let browser;
for (const candidate of candidates) {
  try {
    await access(candidate);
    browser = candidate;
    break;
  } catch {}
}

if (!browser) {
  throw new Error('Set BROWSER_BIN to a Chromium-compatible browser executable.');
}

const expected = referenceDiffChars('ab', 'ac', {});
const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const html = `<!doctype html><pre id="result">pending</pre><script type="module">
  const result = document.querySelector('#result');
  try {
    const browser = await import('/dist/browser/index.js');
    const esm = await import('/dist/esm/index.js');
    result.textContent = JSON.stringify({
      browser: browser.diffChars('ab', 'ac', {}),
      esm: esm.diffChars('ab', 'ac', {}),
    });
  } catch (error) {
    result.textContent = String(error?.stack ?? error);
  }
</script>`;

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(html);
      return;
    }

    const relativePath = request.url?.replace('/dist/', '');
    if (!relativePath || relativePath.includes('..')) {
      response.writeHead(404).end();
      return;
    }

    const path = join(distRoot, relativePath);
    response.setHeader(
      'Content-Type',
      extname(path) === '.wasm' ? 'application/wasm' : 'text/javascript; charset=utf-8'
    );
    response.end(await readFile(path));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

try {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(browser, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--virtual-time-budget=10000',
      '--dump-dom',
      `http://127.0.0.1:${port}`,
    ]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Browser exited with code ${code}:\n${stderr}`));
    });
  });
  const result = output.match(/<pre id="result">([^<]*)<\/pre>/)?.[1];
  assert.ok(result && result !== 'pending', `Browser did not produce a result:\n${output}`);
  assert.match(result, /^\{/, `Artifact invocation failed:\n${result}`);
  const artifacts = JSON.parse(result.replaceAll('&quot;', '"'));
  assert.deepStrictEqual(artifacts.browser, expected);
  assert.deepStrictEqual(artifacts.esm, expected);
} finally {
  server.close();
}

console.log('Browser and ESM artifact diffChars verification passed.');
