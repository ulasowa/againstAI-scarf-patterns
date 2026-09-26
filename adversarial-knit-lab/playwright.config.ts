import { defineConfig, devices } from '@playwright/test'

/**
 * Three ways the same application has to work:
 *   4317 — `dist/` served at a domain root.
 *   4318 — the SAME `dist/`, copied into /knit/lab/v1/ and served from there.
 *          This is the case an absolute base path breaks, and it is also what a
 *          GitHub Pages repository subpath looks like.
 *   file:// — the single-file offline build, opened with no server at all.
 */
export default defineConfig({
  testDir: './e2e',
  // The offline single file is not served by a webServer, so it is built here.
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4317',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        // A synthetic camera, so the capture path is exercised without a
        // physical device and without a permission dialogue.
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command:
        'node scripts/free-port.mjs 4317 && npm run build && npx vite preview --port 4317 --strictPort',
      url: 'http://localhost:4317',
      // Never reuse: an already-running preview serves a stale dist, and the
      // suite would then pass or fail against code that is no longer the code.
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command:
        'node scripts/free-port.mjs 4318 && npm run build:portable && npx vite preview --outDir dist-nested --port 4318 --strictPort',
      url: 'http://localhost:4318/knit/lab/v1/',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
