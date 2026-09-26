import { expect, test } from '@playwright/test'
import { gotoTab, openApp } from './helpers'

test.describe('small screens', () => {
  test('stacks the controls and keeps the canvas usable', async ({ page }) => {
    await openApp(page, 'knit')
    const canvas = page.locator('.chart-canvas canvas')
    await expect(canvas).toBeVisible()

    const viewport = page.viewportSize()!
    const box = (await canvas.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.height).toBeGreaterThan(200)

    // No horizontal overflow of the document itself.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    await gotoTab(page, 'Evaluate')
    await expect(page.getByRole('button', { name: /^Load model/ })).toBeVisible()
  })
})
