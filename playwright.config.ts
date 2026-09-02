import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Signing in two people and waiting on their writes needs more than 45s
  // when every round trip crosses an ocean to reach us-east-1.
  timeout: process.env.TABBY_URL ? 180_000 : 45_000,
  fullyParallel: false,
  workers: 1,
  // TABBY_URL points the same suite at a deployment, so "it works" means it
  // works where the judges will click, not only on this laptop.
  use: {
    baseURL: process.env.TABBY_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
