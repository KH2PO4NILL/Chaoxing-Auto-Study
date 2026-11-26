import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  workers: 2,
  use: { browserName: 'chromium', channel: process.env.STUDY_BROWSER_CHANNEL || undefined },
});
