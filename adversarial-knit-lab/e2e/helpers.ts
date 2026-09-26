import type { Page } from '@playwright/test'
import { gradientPng, scenePng } from './fixtures'

/** Navigate without touching storage. */
export async function visit(page: Page, tab = 'generate', baseUrl = '') {
  await page.goto(`${baseUrl}/#/${tab}`)
  await page.waitForSelector('.app-header')
}

/**
 * Start from a clean browser database so autosave never leaks between tests.
 *
 * The delete is raced against a timeout: the running page holds an open
 * connection, so `deleteDatabase` can block indefinitely and `onblocked` is not
 * guaranteed to fire. A stale database is a far smaller problem than a hung
 * suite, so this gives up rather than waiting.
 */
export async function openApp(page: Page, tab = 'generate', baseUrl = '') {
  await visit(page, tab, baseUrl)
  await page.evaluate(async () => {
    const deleteAll = async () => {
      const databases = (await indexedDB.databases?.()) ?? []
      await Promise.all(
        databases.map(
          (db) =>
            new Promise<void>((resolve) => {
              if (!db.name) return resolve()
              const request = indexedDB.deleteDatabase(db.name)
              request.onsuccess = () => resolve()
              request.onerror = () => resolve()
              request.onblocked = () => resolve()
            }),
        ),
      )
    }
    await Promise.race([deleteAll(), new Promise((resolve) => setTimeout(resolve, 2000))])
  })
  await visit(page, tab, baseUrl)
}

export async function gotoTab(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(150)
}

export function gradientFixture(name = 'gradient.png') {
  return { name, mimeType: 'image/png', buffer: gradientPng() }
}

export function sceneFixture(name = 'scene.png') {
  return { name, mimeType: 'image/png', buffer: scenePng() }
}

/** Collect console errors so a silent runtime failure fails the test. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/**
 * Select a sub-tab inside a panel.
 *
 * Controls are grouped so a column fits on a screen; a test that wants one has
 * to open its group first, exactly as a person does.
 */
export async function subTab(page: Page, label: string) {
  await page.getByRole('tab', { name: label, exact: true }).click()
}
