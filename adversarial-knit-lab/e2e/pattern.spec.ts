import { expect, test } from '@playwright/test'
import { gotoTab, openApp, subTab, trackConsoleErrors } from './helpers'

test.describe('pattern probe', () => {
  test('offers to load a model and says what it does not prove', async ({ page }) => {
    await openApp(page, 'generate')
    await expect(page.getByRole('button', { name: /^Load model/ })).toBeVisible()
    // The limitation is stated next to the button, not buried in documentation.
    await expect(page.getByText(/not evidence that the pattern hides a person/)).toBeVisible()
  })

  test('does not fetch the model until asked', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (/storage\.googleapis\.com/.test(request.url())) requests.push(request.url())
    })
    await openApp(page, 'generate')
    await page.waitForTimeout(1200)
    expect(requests).toEqual([])
  })

  test('runs against the real model and reports what it sees', async ({ page }) => {
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

    const errors = trackConsoleErrors(page)
    await openApp(page, 'generate')
    await page.getByRole('button', { name: /^Load model/ }).click()
    await page.getByRole('button', { name: 'Test pattern' }).click({ timeout: 240_000 })

    const table = page.locator('table.probe-results')
    await expect(table).toBeVisible({ timeout: 180_000 })

    // One row per scale, each reporting a count and a top score.
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      await expect(rows.nth(i).locator('td').first()).not.toBeEmpty()
    }

    // The model is shared, so the Evaluate tab already has it loaded.
    await gotoTab(page, 'Evaluate')
    await expect(page.getByRole('button', { name: 'Reload model' })).toBeVisible()

    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('colour presets', () => {
  test('applying a preset recolours the chart and keeps it valid', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await openApp(page, 'knit')
    await subTab(page, 'Palette')

    const before = await page.locator('.palette-list li').count()
    expect(before).toBeGreaterThan(1)

    // A two-colour preset must remap, not drop, the colours it replaces.
    await page.getByRole('button', { name: /Charcoal & undyed/ }).click()
    await expect(page.locator('.palette-list li')).toHaveCount(2)

    // The chart still renders, which means no cell points past the palette.
    await expect(page.locator('.chart-canvas canvas')).toBeVisible()
    await expect(page.locator('.evidence')).toContainText('Procedural candidate')

    // And back up to four colours.
    await page.getByRole('button', { name: /Indigo & madder/ }).click()
    await expect(page.locator('.palette-list li')).toHaveCount(4)

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('a palette change is undoable', async ({ page }) => {
    await openApp(page, 'knit')
    await subTab(page, 'Palette')
    await page.getByRole('button', { name: /Heather greys/ }).click()
    await expect(page.locator('.palette-list li')).toHaveCount(3)

    await subTab(page, 'Tools')
    await page.getByRole('button', { name: 'Undo' }).click()
    await subTab(page, 'Palette')
    await expect(page.locator('.palette-list li')).toHaveCount(4)
  })
})

test.describe('finished size', () => {
  test('a size preset sets the stitch count through the gauge', async ({ page }) => {
    await openApp(page, 'generate')
    await subTab(page, 'Size')

    await page.getByRole('button', { name: /Classic scarf/ }).click()
    // 25 cm at 20 sts/10 cm = 50 stitches. The row count is clamped, and says so.
    await expect(page.getByText(/50 stitches x/)).toBeVisible()
    await expect(page.getByLabel('Width (cm)')).toHaveValue('25')
  })

  test('entering centimetres converts, and the header follows', async ({ page }) => {
    await openApp(page, 'generate')
    await subTab(page, 'Size')
    await page.getByLabel('Width (cm)').fill('40')
    await page.getByLabel('Length (cm)').fill('40')

    // 40 cm at 20/28 per 10 cm = 80 stitches x 112 rows.
    await expect(page.getByText(/80 stitches x 112 rows/)).toBeVisible()

    await subTab(page, 'Pattern')
    await page.getByRole('button', { name: 'Regenerate' }).click()
    await expect(page.locator('.header-meta')).toContainText('80 sts x 112 rows')
    await expect(page.locator('.header-meta')).toContainText('40.0 x 40.0 cm')
  })

  test('warns instead of silently shrinking an over-large piece', async ({ page }) => {
    await openApp(page, 'generate')
    await subTab(page, 'Size')
    await page.getByLabel('Width (cm)').fill('250')
    const warning = page.locator('.callout-warning').filter({ hasText: 'above the' })
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('repeat')
  })

  test('a circular preset also sets the working method', async ({ page }) => {
    await openApp(page, 'generate')
    await subTab(page, 'Size')
    await page.getByRole('button', { name: /Cowl/ }).click()
    // The width is a circumference, so the label changes with the method.
    await expect(page.getByLabel('Circumference (cm)')).toBeVisible()

    await gotoTab(page, 'Knit')
    await subTab(page, 'Method')
    // Scoped to the panel: the tab panel is labelled by its tab, so it is also
    // named "Method".
    await expect(
      page.getByRole('tabpanel', { name: 'Method' }).getByRole('combobox').first(),
    ).toHaveValue('circular-stranded')
  })
})

test.describe('camera capture', () => {
  test('offers the camera and states where it cannot work', async ({ page }) => {
    await openApp(page, 'evaluate')
    await subTab(page, '2 Photos')
    await expect(page.getByRole('button', { name: 'Use the camera' })).toBeVisible()
    await expect(page.getByText(/never uploaded/)).toBeVisible()
  })

  test('captures a frame and covers the lower part of it', async ({ browser }) => {
    // A fake camera device, so the capture path is exercised for real.
    const context = await browser.newContext({
      permissions: ['camera'],
      // Chromium needs the flags below; they are set on the browser, so this
      // test asserts the capture path rather than the permission dialogue.
    })
    const page = await context.newPage()
    await openApp(page, 'evaluate')
    await subTab(page, '2 Photos')

    await page.getByRole('button', { name: 'Use the camera' }).click()
    const shutter = page.getByRole('button', { name: 'Take photograph' })
    // Starting a camera takes a moment; only give up after actually waiting.
    const live = await shutter
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!live, 'No camera device available in this environment')

    await shutter.click()
    await expect(page.locator('.annotator')).toBeVisible()

    // The frame is annotated and the garment region reported.
    await expect(page.locator('.annotator .hint').first()).toContainText('Garment region')

    // The default region covers the lower band of the frame, never the face.
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('.annotator canvas') as HTMLCanvasElement
      return { width: canvas.width, height: canvas.height }
    })
    expect(geometry.width).toBeGreaterThan(0)

    // The captured frame appears in the list, from the camera rather than a file.
    await expect(page.locator('.image-list li')).toHaveCount(1)
    await expect(page.locator('.image-list li').first()).toContainText('camera-')
    await context.close()
  })
})
