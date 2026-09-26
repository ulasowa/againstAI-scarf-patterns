import { describe, expect, it } from 'vitest'
import { buildCandidatePool, checkConstraints, isBetter, type Candidate } from './search'
import { createProject } from '../chart/project'
import { createGrid, indexOf } from '../chart/grid'
import { makeSettings } from '../generator/generate'
import { paramsForFamily } from '../generator/families'

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    index: 0,
    phase: 'explore',
    settings: makeSettings('contour-network', 1, paramsForFamily('contour-network')),
    grid: createGrid(4, 4),
    patternHash: 'h',
    constraintViolations: [],
    record: null,
    retention: 0.5,
    meanScore: 0.5,
    ...overrides,
  }
}

describe('candidate pool', () => {
  it('is reproducible from the seed', () => {
    const project = createProject()
    const a = buildCandidatePool(project, 4242, 6)
    const b = buildCandidatePool(project, 4242, 6)
    expect(b).toEqual(a)
    expect(a).toHaveLength(6)
  })

  it('differs for a different seed', () => {
    const project = createProject()
    const a = buildCandidatePool(project, 1, 6)
    const b = buildCandidatePool(project, 2, 6)
    expect(b).not.toEqual(a)
  })

  it('keeps every parameter inside its valid range', () => {
    const project = createProject()
    for (const settings of buildCandidatePool(project, 7, 40)) {
      const p = settings.params
      expect(p.featureSize).toBeGreaterThanOrEqual(2)
      expect(p.featureSize).toBeLessThanOrEqual(24)
      for (const value of [p.detailBalance, p.contrast, p.warp, p.symmetry]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
      expect(p.density).toBeGreaterThanOrEqual(0.1)
      expect(p.density).toBeLessThanOrEqual(0.9)
    }
  })
})

describe('hard knitting constraints', () => {
  const project = createProject()
  const constraints = { maxFloat: 5, enforceColorsPerRow: true, maxIsolatedRegions: 2 }

  it('passes a chart that stays inside the limits', () => {
    // Alternating two colours: no float longer than 1.
    const grid = createGrid(8, 4)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) grid.cells[indexOf(grid, r, c)] = c % 2
    }
    expect(checkConstraints(project, grid, constraints, 'h')).toEqual([])
  })

  it('rejects a long float', () => {
    const grid = createGrid(20, 1)
    grid.cells[indexOf(grid, 0, 0)] = 1
    grid.cells[indexOf(grid, 0, 19)] = 1
    const violations = checkConstraints(project, grid, constraints, 'h')
    expect(violations.join(' ')).toMatch(/Longest float/)
  })

  it('rejects too many colours in a row', () => {
    const grid = createGrid(4, 1)
    grid.cells.set([0, 1, 2, 3])
    const violations = checkConstraints(project, grid, constraints, 'h')
    expect(violations.join(' ')).toMatch(/more than 2 colours/)
  })
})

describe('objective ordering', () => {
  it('never selects a candidate that violates a constraint', () => {
    const bad = candidate({ retention: 0, constraintViolations: ['too long'] })
    const ok = candidate({ retention: 1 })
    expect(isBetter(bad, ok)).toBe(false)
    expect(isBetter(bad, null)).toBe(false)
  })

  it('prefers lower detection retention', () => {
    expect(isBetter(candidate({ retention: 0.2 }), candidate({ retention: 0.6 }))).toBe(true)
    expect(isBetter(candidate({ retention: 0.6 }), candidate({ retention: 0.2 }))).toBe(false)
  })

  it('breaks ties on lower mean confidence', () => {
    const low = candidate({ retention: 0.5, meanScore: 0.3 })
    const high = candidate({ retention: 0.5, meanScore: 0.8 })
    expect(isBetter(low, high)).toBe(true)
    expect(isBetter(high, low)).toBe(false)
  })

  it('ignores a candidate that was never measured', () => {
    expect(isBetter(candidate({ retention: null }), candidate({ retention: 0.9 }))).toBe(false)
  })

  it('treats a censored mean score as no worse than an observed one', () => {
    // Nothing was detected, so there is no confidence value to compare.
    const censored = candidate({ retention: 0, meanScore: null })
    const observed = candidate({ retention: 0, meanScore: 0.4 })
    expect(isBetter(censored, observed)).toBe(true)
    expect(isBetter(observed, censored)).toBe(false)
  })
})
