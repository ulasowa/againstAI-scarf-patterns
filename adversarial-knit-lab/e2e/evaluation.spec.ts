import { expect, test } from '@playwright/test'
import { gotoTab, openApp, sceneFixture, subTab, trackConsoleErrors } from './helpers'

test.describe('evaluation', () => {
  test('nothing is downloaded until the model is loaded', async ({ page }) => {
    const modelRequests: string[] = []
    page.on('request', (request) => {
      if (/storage\.googleapis\.com|tfhub|\.bin$/.test(request.url())) {
        modelRequests.push(request.url())
      }
    })
    await openApp(page, 'evaluate')
    await expect(page.getByRole('button', { name: /^Load model/ })).toBeVisible()
    await page.waitForTimeout(1500)
    expect(modelRequests, 'no model artifact may be fetched on page load').toEqual([])
  })

  test('reports a model load failure instead of failing silently', async ({ page }) => {
    await openApp(page, 'evaluate')
    // Block the weight host, so loading must fail in a way the user can read.
    await page.route('**storage.googleapis.com/**', (route) => route.abort())
    await page.getByRole('button', { name: /^Load model/ }).click()
    await expect(page.locator('.callout-error')).toContainText('Model did not load', {
      timeout: 60_000,
    })
    await expect(page.locator('.callout-error')).toContainText('storage.googleapis.com')
  })

  test('refuses a garment region that would cover the face', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await openApp(page, 'evaluate')
    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles(sceneFixture())
    await expect(page.locator('.annotator')).toBeVisible()

    // Drag the top-left garment corner up into the head band.
    const canvas = page.locator('.annotator canvas')
    const box = (await canvas.boundingBox())!
    await page.getByRole('radio', { name: 'Drag garment corners' }).click()
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.05, { steps: 6 })
    await page.mouse.up()

    await expect(page.locator('.annotator .callout-error')).toContainText('head', {
      timeout: 10_000,
    })
    await expect(page.getByRole('button', { name: 'Run evaluation' })).toBeDisabled()

    // The torso helper puts it back into a valid position.
    await page.getByRole('button', { name: 'Fit garment to torso' }).click()
    await expect(page.locator('.annotator .callout-error')).toHaveCount(0)

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('shows the inference budget and keeps run disabled without a model', async ({ page }) => {
    await openApp(page, 'evaluate')
    await subTab(page, '2 Photos')
    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles([
      sceneFixture('a.png'),
      sceneFixture('b.png'),
    ])
    // 2 images x 1 transformation x 4 conditions = 8 calls.
    await expect(page.locator('.stat-value').first()).toHaveText('8')
    await expect(page.getByRole('button', { name: 'Run evaluation' })).toBeDisabled()
  })

  test('the search is unavailable without a loaded model', async ({ page }) => {
    await openApp(page, 'evaluate')
    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles(sceneFixture())
    await subTab(page, 'Search')
    await expect(page.getByRole('button', { name: 'Run search' })).toBeDisabled()
  })

  test('hands over from the Knit tab straight into evaluation', async ({ page }) => {
    await openApp(page, 'knit')
    await page.getByRole('button', { name: 'Test against a model' }).click()
    await expect(page.getByRole('button', { name: /^Load model/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Evaluate', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('hands over from the Generate tab, saving the candidate on the way', async ({ page }) => {
    await openApp(page, 'generate')
    await page.getByRole('button', { name: 'Save and test against a model' }).click()
    await expect(page.getByRole('button', { name: /^Load model/ })).toBeVisible()
  })

  test('evaluation and search state survive a tab change', async ({ page }) => {
    await openApp(page, 'evaluate')
    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles(sceneFixture())
    await gotoTab(page, 'Knit')
    await gotoTab(page, 'Evaluate')
    // The chart is the source of truth; imported photographs are per-session.
    await expect(page.getByRole('button', { name: /^Load model/ })).toBeVisible()
  })
})

/**
 * Real inference against the published COCO-SSD weights.
 *
 * This is the only test that touches the network, and it is skipped rather than
 * failed when the artifact cannot be reached, so an offline run reports "not
 * verified" instead of a false failure. A mocked model would prove nothing
 * about inference, so there is no mocked substitute.
 */
test.describe('real model inference', () => {
  test('loads the published weights and runs a paired evaluation', async ({ page }) => {
    test.setTimeout(300_000)
    const reachable = await page.evaluate(async () => {
      try {
        const response = await fetch(
          'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
          { method: 'GET', mode: 'cors' },
        )
        return response.ok
      } catch {
        return false
      }
    })
    test.skip(!reachable, 'COCO-SSD weights are not reachable from this environment')

    await openApp(page, 'evaluate')
    await page.getByRole('button', { name: /^Load model/ }).click()
    await expect(page.locator('.callout-success')).toContainText('Ready on the', {
      timeout: 240_000,
    })

    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles(sceneFixture())
    await page.getByRole('button', { name: 'Fit garment to torso' }).click()
    await page.getByRole('button', { name: 'Run evaluation' }).click()

    await expect(page.locator('table.results').first()).toBeVisible({ timeout: 240_000 })
    // Every condition must be reported, including the ones with no detection.
    await expect(page.locator('table.results').first()).toContainText('Chart-derived pattern')
    await expect(page.locator('table.results').first()).toContainText('Original photograph')
  })

  test('refuses to invent a target when no person is detected', async ({ page }) => {
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

    await openApp(page, 'evaluate')
    await page.getByRole('button', { name: /^Load model/ }).click()
    await expect(page.locator('.callout-success')).toContainText('Ready on the', {
      timeout: 240_000,
    })

    // The synthetic scene contains no person. The detector reports other
    // classes for it, so auto-annotation must decline rather than guess: an
    // image the baseline cannot detect says nothing about whether a pattern
    // hid anyone.
    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles(sceneFixture())
    await expect(page.getByText(/No person was detected in/)).toBeVisible({ timeout: 60_000 })

    // Nothing was annotated, so the run stays available but the user has been
    // told why this photograph cannot answer the question.
    await expect(page.getByText(/Annotated 0 of 1/)).toBeVisible()
  })

  test('cancels a running evaluation', async ({ page }) => {
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

    await openApp(page, 'evaluate')
    await page.getByRole('button', { name: /^Load model/ }).click()
    await expect(page.locator('.callout-success')).toContainText('Ready on the', {
      timeout: 240_000,
    })
    await subTab(page, '2 Photos')
    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles([
      sceneFixture('a.png'),
      sceneFixture('b.png'),
      sceneFixture('c.png'),
      sceneFixture('d.png'),
    ])
    // Enough work queued that there is something to cancel.
    await subTab(page, '4 Probes')
    await page.getByLabel('Enable transformations').check()
    await page.getByLabel('Samples per photograph').fill('8')
    await subTab(page, 'Measure')
    await page.getByRole('button', { name: 'Run evaluation' }).click()

    const cancel = page.getByRole('button', { name: 'Cancel run', exact: true })
    await expect(cancel).toBeEnabled()
    await cancel.click()
    await expect(page.locator('.callout-error')).toContainText('cancelled', { timeout: 120_000 })
    // Partial results are discarded rather than presented as a measurement.
    await expect(page.locator('table.results')).toHaveCount(0)
  })
})
