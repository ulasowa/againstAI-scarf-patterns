import { execSync } from 'node:child_process'

/**
 * Build the single-file offline copy before the suite runs.
 *
 * The `file://` tests open `dist-offline/adversarial-knit-lab.html` directly.
 * Playwright's webServer entries build the served variants, but nothing built
 * this one, so it silently kept whatever an earlier run had left there — and a
 * stale artifact that passes is worse than one that fails.
 */
export default function globalSetup() {
  execSync('npm run build:offline', { stdio: 'inherit' })
}
