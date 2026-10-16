import { defineConfig } from '@playwright/test';
import config from './playwright.config.ts';

export default defineConfig({
  ...config,
  testMatch: 'playthrough.spec.ts',
  use: { ...config.use, viewport: { width: 1920, height: 1080 } },
});
