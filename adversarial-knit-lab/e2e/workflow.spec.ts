import { expect, test } from '@playwright/test'
import { gotoTab, gradientFixture, openApp, subTab, trackConsoleErrors } from './helpers'

test.describe('core workflow', () => {
  test('generate, edit, reload and keep the chart', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await openApp(page, 'generate')
    await subTab(page, 'Pattern')

    await page.getByRole('button', { name: 'Random seed' }).click()
    const seed = await page.getByLabel('Seed', { exact: true }).inputValue()
    expect(Number(seed)).toBeGreaterThan(0)

    await gotoTab(page, 'Knit')
    const canvas = page.locator('.chart-canvas canvas')
    await expect(canvas).toBeVisible()

    // Paint a stitch, then confirm the status line reports a real coordinate.
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + 120, box!.y + 120)
    await expect(page.locator('.chart-status')).toContainText('Stitch')

    // Autosave is debounced; give it a moment, then reload.
    await page.waitForTimeout(1400)
    await page.reload()
    await page.waitForSelector('.app-header')
    await gotoTab(page, 'Knit')
    await expect(page.locator('.chart-canvas canvas')).toBeVisible()

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('undo and redo move the chart back and forward', async ({ page }) => {
    await openApp(page, 'knit')
    const undo = page.getByRole('button', { name: 'Undo' })
    const redo = page.getByRole('button', { name: 'Redo' })
    await expect(undo).toBeDisabled()

    const canvas = page.locator('.chart-canvas canvas')
    const box = await canvas.boundingBox()
    await page.mouse.click(box!.x + 90, box!.y + 90)
    await expect(undo).toBeEnabled()

    await undo.click()
    await expect(redo).toBeEnabled()
    await redo.click()
    await expect(undo).toBeEnabled()
  })

  test('editing stays aligned after zoom and pan', async ({ page }) => {
    await openApp(page, 'knit')
    const canvas = page.locator('.chart-canvas canvas')
    const box = (await canvas.boundingBox())!

    // Zoom in with Ctrl + wheel, then read the reported cell under the pointer.
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -400)
    await page.keyboard.up('Control')
    await expect(page.locator('.chart-status')).not.toContainText('Zoom 100%')

    const before = await page.locator('.chart-status span').first().textContent()
    await page.mouse.move(box.x + 200, box.y + 200)
    const after = await page.locator('.chart-status span').first().textContent()
    expect(after).toBe(before)

    // Pan, and confirm the same screen point now reports a different cell.
    await page.getByRole('radio', { name: 'Pan' }).click()
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 260, { steps: 8 })
    await page.mouse.up()
    await page.mouse.move(box.x + 200, box.y + 200)
    const panned = await page.locator('.chart-status span').first().textContent()
    expect(panned).not.toBe(before)

    await page.getByRole('button', { name: 'Reset view' }).click()
    await expect(page.locator('.chart-status')).toContainText('Zoom 100%')
  })

  test('import an image, reduce it to yarn colours and export a chart', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await openApp(page, 'generate')

    await subTab(page, 'Image')
    await page
      .getByLabel('Image file to convert into a chart')
      .setInputFiles(gradientFixture())
    await expect(page.locator('.callout-success')).toContainText('Imported gradient.png', {
      timeout: 30_000,
    })

    await gotoTab(page, 'Export')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Clean pattern tile' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.png$/)

    expect(errors.filter((e) => !e.includes('favicon')), errors.join('\n')).toEqual([])
  })

  test('export a vector chart, a project file and a PDF', async ({ page }) => {
    await openApp(page, 'export')

    for (const [group, label, extension] of [
      ['Documents', 'Vector chart with legend', /\.svg$/],
      ['Project', 'Export project JSON', /\.json$/],
      ['Documents', 'Printable knitting document', /\.pdf$/],
    ] as const) {
      await subTab(page, group)
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: label }).click()
      const file = await download
      expect(file.suggestedFilename(), label).toMatch(extension)
    }
  })

  test('a project file round-trips through export and import', async ({ page }) => {
    await openApp(page, 'generate')
    await subTab(page, 'Pattern')
    await page.getByRole('button', { name: 'Random seed' }).click()
    const seed = await page.getByLabel('Seed', { exact: true }).inputValue()

    await gotoTab(page, 'Export')
    await subTab(page, 'Project')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export project JSON' }).click()
    const path = await (await download).path()

    await page.getByLabel('Project file to import').setInputFiles(path!)
    await expect(page.locator('.callout-success')).toBeVisible()

    await gotoTab(page, 'Generate')
    await subTab(page, 'Pattern')
    // The stored generator settings come back with the project.
    await expect(page.getByLabel('Seed', { exact: true })).toHaveValue(seed)
  })

  test('rejects an invalid project file with a readable message', async ({ page }) => {
    await openApp(page, 'export')
    await subTab(page, 'Project')
    await page.getByLabel('Project file to import').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"something-else"}'),
    })
    await expect(page.locator('.callout-error')).toContainText('not a valid project')
  })
})

test.describe('examples', () => {
  test('every bundled example opens and reports its own analysis', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await openApp(page, 'export')
    await subTab(page, 'Project')

    const list = page
      .locator('.panel-section')
      .filter({ hasText: 'Example projects' })
      .locator('.image-list li > button:first-child')
    await expect(list.first()).toBeVisible()
    const titles = await list.allTextContents()
    expect(titles.length).toBeGreaterThanOrEqual(5)

    for (const title of titles) {
      await page.getByRole('button', { name: 'Export', exact: true }).click()
      await subTab(page, 'Project')
      await page.getByRole('button', { name: title, exact: true }).click()
      await expect(page.locator('.callout-success')).toContainText(title)

      await page.getByRole('button', { name: 'Knit', exact: true }).click()
      await expect(page.locator('.chart-canvas canvas')).toBeVisible()
      // Opening an example must never present stale measurements as current.
      await expect(page.locator('.evidence')).toContainText('Procedural candidate')
    }

    expect(errors.filter((e) => !e.includes('favicon')), errors.join('\n')).toEqual([])
  })
})
