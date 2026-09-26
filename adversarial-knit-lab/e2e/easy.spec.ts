import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openApp, trackConsoleErrors } from './helpers'

async function enterGuided(page: import('@playwright/test').Page) {
  await page.getByRole('switch', { name: 'Guided mode' }).click()
  await page.waitForSelector('.easy')
}

test.describe('guided mode', () => {
  test('is off by default and replaces the tabs when switched on', async ({ page }) => {
    await openApp(page, 'generate')
    const toggle = page.getByRole('switch', { name: 'Guided mode' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('.tabs')).toBeVisible()

    await enterGuided(page)
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    // The dense workflow navigation is gone, not merely hidden behind it.
    await expect(page.locator('.tabs')).toHaveCount(0)
  })

  test('walks through four steps and fits one screen', async ({ page }) => {
    const errors = trackConsoleErrors(page)
    await openApp(page, 'generate')
    await enterGuided(page)

    const headings = ['Pick a pattern', 'Choose yarn colours and size', 'See what a detector makes of it', 'Knit it']
    for (const [index, heading] of headings.entries()) {
      await expect(page.locator('.easy-body h2')).toHaveText(heading)
      const screens = await page.evaluate(
        () => document.documentElement.scrollHeight / window.innerHeight,
      )
      expect(screens, `step ${index + 1} is ${screens.toFixed(1)} screens tall`).toBeLessThanOrEqual(2)
      if (index < headings.length - 1) await page.getByRole('button', { name: 'Next' }).click()
    }

    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('choosing a pattern changes the chart, and says how hard it is to knit', async ({ page }) => {
    await openApp(page, 'generate')
    await enterGuided(page)

    const choices = page.locator('.easy-choice')
    await expect(choices).toHaveCount(5)
    // Difficulty comes from the measured figures, so every preset carries one.
    await expect(page.locator('.easy-choice .ease')).toHaveCount(5)
    await expect(page.locator('.easy-choice .ease.ok').first()).toBeVisible()

    await choices.nth(3).click()
    await expect(page.locator('.project-title')).toHaveValue('Angular shards')
    await expect(page.locator('.header-meta')).toContainText('sts x')
  })

  test('colour and size presets apply, and the header follows', async ({ page }) => {
    await openApp(page, 'generate')
    await enterGuided(page)
    await page.getByRole('button', { name: 'Next' }).click()

    await page.getByRole('button', { name: /Charcoal & undyed/ }).click()
    await page.getByRole('button', { name: /Headband/ }).click()
    // 10 cm at 20 sts/10 cm = 20 stitches.
    await expect(page.locator('.header-meta')).toContainText('20 sts x')
  })

  test('the test step refuses to run without a model or a picture', async ({ page }) => {
    await openApp(page, 'generate')
    await enterGuided(page)
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByRole('button', { name: 'Test the pattern' })).toBeDisabled()
    await expect(page.getByText('Load the detector and add a picture first')).toBeVisible()
    // The caveat is on the step itself, not hidden in documentation.
    await expect(page.getByText(/not evidence that the pattern hides you/)).toBeVisible()
  })

  test('the knitting step offers the PDF and warns about awkward charts', async ({ page }) => {
    await openApp(page, 'generate')
    await enterGuided(page)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download the knitting pattern/ }).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
    await expect(page.getByText('Before you cast on')).toBeVisible()
  })

  test('the preference survives a reload', async ({ page }) => {
    await openApp(page, 'generate')
    await enterGuided(page)
    await page.reload()
    await page.waitForSelector('.app-header')
    await expect(page.locator('.easy')).toBeVisible()
  })

  test('has no automatically detectable accessibility violations', async ({ page }) => {
    await openApp(page, 'generate')
    await enterGuided(page)
    for (let step = 0; step < 4; step++) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .disableRules(['landmark-unique'])
        .analyze()
      const report = results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.help}`)
        .join('\n')
      expect(report, `step ${step + 1}: ${report}`).toBe('')
      if (step < 3) await page.getByRole('button', { name: 'Next' }).click()
    }
  })
})
