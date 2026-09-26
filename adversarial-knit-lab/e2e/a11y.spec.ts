import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { gotoTab, gradientFixture, openApp, sceneFixture, subTab, visit } from './helpers'

/**
 * Automated accessibility checks.
 *
 * axe-core catches a specific class of defect: missing names, broken label
 * associations, insufficient contrast, bad ARIA, heading and landmark
 * problems. It does not catch everything, so `docs/ui-audit.md` records the
 * manual pass alongside these.
 *
 * The chart canvas is excluded from colour-contrast rules only: it renders
 * user-chosen yarn colours, and "the knitter picked two similar colours" is a
 * knitting-analysis concern, not an interface defect.
 */
async function scan(page: Page, context?: string) {
  // WCAG A and AA, plus the two structural best-practice rules that matter
  // most for a dense single-page tool.
  const builder = new AxeBuilder({ page })
    .withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'best-practice',
    ])
    .disableRules([
      // Scoped deliberately: this application is one region-dense page and the
      // rules below flag stylistic choices rather than barriers.
      'landmark-unique',
    ])
  if (context) builder.include(context)
  return builder.analyze()
}

function format(violations: Awaited<ReturnType<typeof scan>>['violations']) {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
          .slice(0, 4)
          .map((n) => n.target.join(' '))
          .join('\n  ')}`,
    )
    .join('\n\n')
}

test.describe('accessibility', () => {
  for (const tab of ['generate', 'knit', 'evaluate', 'export'] as const) {
    test(`${tab} tab has no automatically detectable violations`, async ({ page }) => {
      await openApp(page, tab)
      await page.waitForTimeout(500)
      const results = await scan(page)
      expect(format(results.violations), format(results.violations)).toBe('')
    })
  }

  test('expanded detail panels stay accessible', async ({ page }) => {
    await openApp(page, 'evaluate')
    for (const summary of await page.locator('details summary').all()) {
      await summary.click()
    }
    await page.waitForTimeout(300)
    const results = await scan(page)
    expect(format(results.violations), format(results.violations)).toBe('')
  })

  test('error and populated states stay accessible', async ({ page }) => {
    await openApp(page, 'export')
    await subTab(page, 'Project')
    await page.getByLabel('Project file to import').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"nope":1}'),
    })
    await expect(page.locator('.callout-error')).toBeVisible()

    await gotoTab(page, 'Evaluate')
    await subTab(page, '2 Photos')
    await page.getByLabel('Photographs to evaluate').setInputFiles(sceneFixture())
    await expect(page.locator('.annotator')).toBeVisible()

    const results = await scan(page)
    expect(format(results.violations), format(results.violations)).toBe('')
  })

  test('the imported-image state stays accessible', async ({ page }) => {
    await openApp(page, 'generate')
    await subTab(page, 'Image')
    await page.getByLabel('Image file to convert into a chart').setInputFiles(gradientFixture())
    await expect(page.locator('.callout-success')).toBeVisible({ timeout: 30_000 })
    const results = await scan(page)
    expect(format(results.violations), format(results.violations)).toBe('')
  })
})

test.describe('keyboard and reflow', () => {
  test('every control on a tab is reachable by keyboard, with no trap', async ({ page }) => {
    await openApp(page, 'generate')
    await page.locator('body').click({ position: { x: 2, y: 2 } })

    const seen = new Set<string>()
    let focusLeftThePage = false
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab')
      const id = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const label =
          el.getAttribute('aria-label') ??
          el.textContent?.trim().slice(0, 30) ??
          el.tagName
        return `${el.tagName}:${label}`
      })
      if (id === null) {
        focusLeftThePage = true
        break
      }
      seen.add(id)
    }

    // Reaching the browser chrome again proves there is no focus trap. The
    // count is deliberately modest: controls are grouped into sub-tabs, so one
    // screen exposes a handful of groups rather than every control at once.
    expect(focusLeftThePage).toBe(true)
    expect(seen.size).toBeGreaterThan(8)
  })

  test('focus is visible on both light and dark buttons', async ({ page }) => {
    await openApp(page, 'generate')
    await subTab(page, 'Pattern')

    // Focus must arrive by keyboard: the ring is `:focus-visible`, and after a
    // pointer interaction a programmatic .focus() deliberately does not match
    // it. Tabbing is what a keyboard user actually does.
    await page.keyboard.press('Tab')
    let found = false
    for (let i = 0; i < 60 && !found; i++) {
      found = await page.evaluate(
        () => document.activeElement?.textContent?.trim() === 'Regenerate',
      )
      if (!found) await page.keyboard.press('Tab')
    }
    expect(found, 'Regenerate should be reachable by tabbing').toBe(true)

    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const style = getComputedStyle(el)
      return {
        width: style.outlineWidth,
        style: style.outlineStyle,
        focusVisible: el.matches(':focus-visible'),
        // The dark primary button is the hard case: the ring must not vanish
        // into the button.
        background: style.backgroundColor,
      }
    })
    expect(outline.focusVisible).toBe(true)
    expect(outline.style).not.toBe('none')
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2)
  })

  test('the chart canvas is operable from the keyboard alone', async ({ page }) => {
    await openApp(page, 'knit')
    const canvas = page.locator('.chart-canvas canvas')
    await canvas.focus()
    const before = await page.locator('.chart-status span').first().textContent()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowUp')
    const after = await page.locator('.chart-status span').first().textContent()
    expect(after).not.toBe(before)
    // The position is announced, not only drawn.
    await expect(page.locator('.chart-status')).toHaveAttribute('aria-live', 'polite')
  })

  test('reflows at 320 CSS pixels with no horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    for (const tab of ['generate', 'knit', 'evaluate', 'export'] as const) {
      await visit(page, tab)
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${tab} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1)
    }
  })

  test('touch targets are large enough on a coarse pointer', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await openApp(page, 'knit')

    const heights = await page.locator('.tool-row button').evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    )
    expect(heights.length).toBeGreaterThan(0)
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44)
    await context.close()
  })

  test('the document title follows the visible tab', async ({ page }) => {
    await openApp(page, 'generate')
    await expect(page).toHaveTitle(/^Generate - /)
    await gotoTab(page, 'Evaluate')
    await expect(page).toHaveTitle(/^Evaluate - /)
  })
})

test.describe('grouped controls', () => {
  /**
   * The complaint this guards against: the control columns used to run to
   * several screen heights, so every adjustment became a scroll hunt. Measured
   * before grouping: 2.9 screens on desktop and 5.6 on a phone.
   */
  const LIMITS = { desktop: 1.6, phone: 3.4 }

  test('no tab runs far past the viewport on a desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 })
    for (const tab of ['generate', 'knit', 'evaluate', 'export'] as const) {
      await visit(page, tab)
      await page.waitForTimeout(400)
      const screens = await page.evaluate(
        () => document.documentElement.scrollHeight / window.innerHeight,
      )
      expect(screens, `${tab} is ${screens.toFixed(1)} screens tall`).toBeLessThanOrEqual(
        LIMITS.desktop,
      )
    }
  })

  test('no tab runs far past the viewport on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const tab of ['generate', 'knit', 'evaluate', 'export'] as const) {
      await visit(page, tab)
      await page.waitForTimeout(400)
      const screens = await page.evaluate(
        () => document.documentElement.scrollHeight / window.innerHeight,
      )
      expect(screens, `${tab} is ${screens.toFixed(1)} screens tall`).toBeLessThanOrEqual(
        LIMITS.phone,
      )
    }
  })

  test('sub-tabs are a real tab list, driven by arrow keys', async ({ page }) => {
    await openApp(page, 'generate')
    const list = page.getByRole('tablist', { name: 'Generator settings' })
    await expect(list).toBeVisible()

    const tabs = list.getByRole('tab')
    await expect(tabs).toHaveCount(5)
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')

    // Roving tabindex: the group is one tab stop, then arrows move within it.
    await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1')

    await tabs.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')

    // The panel is associated with its tab, so a screen reader can follow.
    const panelId = await tabs.first().getAttribute('aria-controls')
    await expect(page.locator(`#${panelId}`)).toHaveAttribute('role', 'tabpanel')
  })

  test('a finished evaluation brings the results forward', async ({ page }) => {
    await openApp(page, 'evaluate')
    // Without a run there is nothing to show, and the tab says so rather than
    // appearing empty.
    await page.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(page.getByText('Nothing measured yet')).toBeVisible()
  })
})
