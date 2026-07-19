import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { diffChars as referenceDiffChars, diffJson as referenceDiffJson } from 'diff';

const testOrigin = 'https://diff-native.test';
const artifactFiles = new Map([
  ['/dist/browser/index.js', new URL('../dist/browser/index.js', import.meta.url)],
  ['/dist/browser/json.js', new URL('../dist/browser/json.js', import.meta.url)],
  ['/dist/browser/diff_native.js', new URL('../dist/browser/diff_native.js', import.meta.url)],
  [
    '/dist/browser/diff_native_bg.wasm',
    new URL('../dist/browser/diff_native_bg.wasm', import.meta.url),
  ],
  ['/dist/esm/index.js', new URL('../dist/esm/index.js', import.meta.url)],
  ['/dist/esm/json.js', new URL('../dist/esm/json.js', import.meta.url)],
  ['/dist/esm/diff_native.js', new URL('../dist/esm/diff_native.js', import.meta.url)],
  ['/dist/esm/diff_native_bg.wasm', new URL('../dist/esm/diff_native_bg.wasm', import.meta.url)],
]);

test('browser and ESM artifacts initialize before exported APIs are called', async ({ page }) => {
  await page.route(`${testOrigin}/**`, async route => {
    const { pathname } = new URL(route.request().url());

    if (pathname === '/') {
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body></body></html>',
      });
      return;
    }

    const artifactFile = artifactFiles.get(pathname);
    if (!artifactFile) {
      await route.fulfill({ status: 404 });
      return;
    }

    await route.fulfill({
      contentType: pathname.endsWith('.wasm')
        ? 'application/wasm'
        : 'text/javascript; charset=utf-8',
      body: await readFile(artifactFile),
    });
  });

  await page.goto(testOrigin);
  const artifacts = await page.evaluate(
    async ({ browserArtifactUrl, esmArtifactUrl }) => {
      const browserArtifact = await import(browserArtifactUrl);
      const esmArtifact = await import(esmArtifactUrl);

      return {
        browserChars: browserArtifact.diffChars('ab', 'ac', {}),
        esmChars: esmArtifact.diffChars('ab', 'ac', {}),
        browserJson: browserArtifact.diffJson('', 'a\nb\n', { oneChangePerToken: true }),
        esmJson: esmArtifact.diffJson('', 'a\nb\n', { oneChangePerToken: true }),
      };
    },
    {
      browserArtifactUrl: `${testOrigin}/dist/browser/index.js`,
      esmArtifactUrl: `${testOrigin}/dist/esm/index.js`,
    }
  );
  const expectedChars = referenceDiffChars('ab', 'ac', {});
  const expectedJson = referenceDiffJson('', 'a\nb\n', { oneChangePerToken: true });

  expect(artifacts.browserChars).toStrictEqual(expectedChars);
  expect(artifacts.esmChars).toStrictEqual(expectedChars);
  expect(artifacts.browserJson).toStrictEqual(expectedJson);
  expect(artifacts.esmJson).toStrictEqual(expectedJson);
});
