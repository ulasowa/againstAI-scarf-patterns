import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { subTab, trackConsoleErrors } from './helpers'

/**
 * The application must not depend on being deployed anywhere in particular.
 * These are the three cases that break when a build hard-codes an absolute
 * base path or fetches its own files at runtime.
 */

test.describe('served from an arbitrary subdirectory', () => {
  test.use({ baseURL: 'http://localhost:4318' })

  test('the same build runs from /knit/lab/v1/ with no configuration', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    const failed: string[] = []
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
    })

    await page.goto('/knit/lab/v1/#/generate')
    await expect(page.locator('.app-header h1')).toHaveText('Adversarial Knit Lab')

    // Every asset URL must be relative, or this deployment 404s.
    const sources = await page
      .locator('script[src], link[href]')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            node.getAttribute('src') ?? node.getAttribute('href') ?? '',
        ),
      )
    for (const source of sources) {
      expect(source, 'asset URLs must not be absolute').not.toMatch(/^\//)
    }

    // Static assets resolve against the subdirectory.
    expect((await page.request.get('/knit/lab/v1/favicon.svg')).status()).toBe(200)

    // Hash routing survives a reload on a static host.
    await page.goto('/knit/lab/v1/#/knit')
    await page.reload()
    await expect(page.locator('.chart-canvas canvas')).toBeVisible()

    // Examples are bundled, so they need no request at all.
    await page.goto('/knit/lab/v1/#/export')
    await subTab(page, 'Project')
    await page.getByRole('button', { name: 'Micro checks', exact: true }).click()
    await expect(page.locator('.project-title')).toHaveValue('Micro checks')

    expect(failed, failed.join('\n')).toEqual([])
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('offline single file', () => {
  const offlineFile = resolve('dist-offline/adversarial-knit-lab.html')

  test.skip(
    !existsSync(offlineFile),
    'Run `npm run build:offline` first to produce the single-file build',
  )

  test('opens straight from the filesystem with no server', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    const requests: string[] = []
    page.on('requestfailed', (request) =>
      requests.push(`${request.url()} ${request.failure()?.errorText}`),
    )

    await page.goto(pathToFileURL(offlineFile).href)
    await expect(page.locator('.app-header h1')).toHaveText('Adversarial Knit Lab')

    // Generate, edit and read the chart.
    await page.getByRole('button', { name: 'Octave stack' }).click()
    await page.getByRole('button', { name: 'Knit', exact: true }).click()
    await expect(page.locator('.chart-canvas canvas')).toBeVisible()
    await expect(page.locator('.chart-status')).toContainText('Stitch')

    // Examples are bundled: fetching a sibling file would be blocked here.
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await subTab(page, 'Project')
    await page.getByRole('button', { name: 'Dense contour network', exact: true }).click()
    await expect(page.locator('.project-title')).toHaveValue('Dense contour network')

    // Code that is lazily imported on the web must be inlined here, or the PDF
    // button would fail with a blocked dynamic import.
    await subTab(page, 'Documents')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Printable knitting document' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)

    expect(requests, requests.join('\n')).toEqual([])
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('still reaches the model, because the weights allow any origin', async ({ page }) => {
    test.setTimeout(300_000)
    const reachable = await page.evaluate(async () => {
      try {
        const response = await fetch(
          'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
        )
        return response.ok
      } catch {
        return false
      }
    })
    test.skip(!reachable, 'COCO-SSD weights are not reachable from this environment')

    await page.goto(pathToFileURL(offlineFile).href)
    await page.getByRole('button', { name: 'Evaluate', exact: true }).click()
    await page.getByRole('button', { name: /^Load model/ }).click()
    // A file:// page is an opaque origin; this works only because the weight
    // host sends `access-control-allow-origin: *`.
    await expect(page.locator('.callout-success')).toContainText('Ready on the', {
      timeout: 240_000,
    })
  })
})
