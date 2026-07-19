import { defineConfig } from '@playwright/test';

export default defineConfig({
  outputDir: 'out/playwright',
  testMatch: 'browser-entry.playwright.ts',
});
