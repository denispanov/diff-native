import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { diffChars as referenceDiffChars } from 'diff';

const testOrigin = 'https://diff-native.test';
const boundarySnippet = 'snippets/diff_native-92ff7183fe0b6b99/src/patch-boundary.js';
const artifactFiles = new Map([
  ['/dist/browser/index.js', new URL('../dist/browser/index.js', import.meta.url)],
  ['/dist/browser/diff_native.js', new URL('../dist/browser/diff_native.js', import.meta.url)],
  [
    '/dist/browser/diff_native_bg.wasm',
    new URL('../dist/browser/diff_native_bg.wasm', import.meta.url),
  ],
  [
    `/dist/browser/${boundarySnippet}`,
    new URL(`../dist/browser/${boundarySnippet}`, import.meta.url),
  ],
  ['/dist/esm/index.js', new URL('../dist/esm/index.js', import.meta.url)],
  ['/dist/esm/diff_native.js', new URL('../dist/esm/diff_native.js', import.meta.url)],
  ['/dist/esm/diff_native_bg.wasm', new URL('../dist/esm/diff_native_bg.wasm', import.meta.url)],
  [`/dist/esm/${boundarySnippet}`, new URL(`../dist/esm/${boundarySnippet}`, import.meta.url)],
]);

test('browser and ESM artifacts initialize before diffChars is called', async ({ page }) => {
  await page.route(`${testOrigin}/**`, async route => {
    const { pathname } = new URL(route.request().url());

    if (pathname === '/') {
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        headers: {
          'Content-Security-Policy':
            "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
        },
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

      function structuredBehavior(artifact: typeof browserArtifact) {
        const hunks = Array(2);
        const lines = Array(2);
        lines[1] = ' value';
        hunks[1] = { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines };
        const converted = artifact.unixToWin({ hunks });
        const events: string[] = [];
        const accessorPatch = {} as Record<string, unknown>;
        Object.defineProperty(accessorPatch, 'hunks', {
          enumerable: true,
          get() {
            events.push('hunks');
            return [];
          },
        });
        artifact.reversePatch(accessorPatch);
        let newlineError: { name: string; message: string } | undefined;
        try {
          artifact.structuredPatch('x', 'x', 'a', 'b', undefined, undefined, {
            newlineIsToken: 1,
          });
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          newlineError = { name: error.name, message: error.message };
        }
        const malformedErrors = [{}, [], 1].map(patch => {
          try {
            artifact.applyPatch('value', patch);
          } catch (error) {
            if (!(error instanceof Error)) throw error;
            return error.name;
          }
          return undefined;
        });
        return {
          formatted: artifact.formatPatch(
            { oldFileName: 'x', newFileName: 'x', hunks: [] },
            artifact.OMIT_HEADERS
          ),
          created: artifact.createPatch('x', 'a\n', 'b\n', undefined, undefined, {
            headerOptions: artifact.OMIT_HEADERS,
          }),
          constants: artifact.OMIT_HEADERS,
          hunkKeys: Object.keys(converted.hunks),
          lineKeys: Object.keys(converted.hunks[1].lines),
          events,
          newlineError,
          malformedErrors,
          isUnix: artifact.isUnix(Array(2)),
          isWin: artifact.isWin(Array(2)),
        };
      }

      return {
        browserArtifact: browserArtifact.diffChars('ab', 'ac', {}),
        esmArtifact: esmArtifact.diffChars('ab', 'ac', {}),
        browserStructured: structuredBehavior(browserArtifact),
        esmStructured: structuredBehavior(esmArtifact),
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
  expect(artifacts.browserStructured).toStrictEqual(artifacts.esmStructured);
  expect(artifacts.browserStructured).toStrictEqual({
    formatted: '\n',
    created: '@@ -1,1 +1,1 @@\n-a\n+b\n',
    constants: { includeIndex: false, includeUnderline: false, includeFileHeaders: false },
    hunkKeys: ['1'],
    lineKeys: ['1'],
    events: ['hunks', 'hunks'],
    newlineError: {
      name: 'Error',
      message:
        'newlineIsToken may not be used with patch-generation functions, only with diffing functions',
    },
    malformedErrors: ['TypeError', 'TypeError', 'TypeError'],
    isUnix: true,
    isWin: false,
  });
});
