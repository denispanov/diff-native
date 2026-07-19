import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { diffChars as referenceDiffChars } from 'diff';

const testOrigin = 'https://diff-native.test';
const artifactFiles = new Map([
  ['/dist/browser/index.js', new URL('../dist/browser/index.js', import.meta.url)],
  ['/dist/browser/diff_native.js', new URL('../dist/browser/diff_native.js', import.meta.url)],
  [
    '/dist/browser/diff_native_bg.wasm',
    new URL('../dist/browser/diff_native_bg.wasm', import.meta.url),
  ],
  ['/dist/esm/index.js', new URL('../dist/esm/index.js', import.meta.url)],
  ['/dist/esm/diff_native.js', new URL('../dist/esm/diff_native.js', import.meta.url)],
  ['/dist/esm/diff_native_bg.wasm', new URL('../dist/esm/diff_native_bg.wasm', import.meta.url)],
]);

test('browser and ESM artifacts initialize before diffChars is called', async ({ page }) => {
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
        browserArtifact: browserArtifact.diffChars('ab', 'ac', {}),
        esmArtifact: esmArtifact.diffChars('ab', 'ac', {}),
      };
    },
    {
      browserArtifactUrl: `${testOrigin}/dist/browser/index.js`,
      esmArtifactUrl: `${testOrigin}/dist/esm/index.js`,
    }
  );
  const expected = referenceDiffChars('ab', 'ac', {});

  expect(artifacts.browserArtifact).toStrictEqual(expected);
  expect(artifacts.esmArtifact).toStrictEqual(expected);
});
