import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODEL_REGISTRY, createAdapter } from './registry'

/**
 * public/model-manifest.json is a published document about what this
 * application runs. If it drifts from the adapters, it becomes a set of claims
 * nobody checked, so it is checked here.
 */
const manifest = JSON.parse(readFileSync('public/model-manifest.json', 'utf8')) as {
  models: Record<string, unknown>[]
}

describe('model manifest', () => {
  it('lists exactly the models in the registry', () => {
    expect(manifest.models.map((m) => m.id).sort()).toEqual(
      MODEL_REGISTRY.map((m) => m.id).sort(),
    )
  })

  it('matches each adapter descriptor field for field', () => {
    for (const entry of manifest.models) {
      const descriptor = createAdapter(entry.id as string).descriptor
      expect(entry.family, entry.id as string).toBe(descriptor.family)
      expect(entry.variant).toBe(descriptor.variant)
      expect(entry.artifactUrl).toBe(descriptor.artifactUrl)
      expect(entry.artifactHash).toBe(descriptor.artifactHash)
      expect(entry.approximateDownloadBytes).toBe(descriptor.approximateDownloadBytes)
      expect(entry.license).toBe(descriptor.license)
      expect(entry.inputResolution).toBe(descriptor.inputResolution)
      expect(entry.channelOrder).toBe(descriptor.channelOrder)
      expect(entry.normalization).toBe(descriptor.normalization)
      expect(entry.resizeBehavior).toBe(descriptor.resizeBehavior)
      expect(entry.outputLayout).toBe(descriptor.outputLayout)
      expect(entry.classMapping).toBe(descriptor.classMapping)
      expect(entry.nmsBehavior).toBe(descriptor.nmsBehavior)
    }
  })

  it('never claims a checksum it did not verify', () => {
    for (const entry of manifest.models) {
      if (entry.artifactHash !== null) {
        expect(entry.artifactHashNote, `${entry.id} declares a hash`).toBeTruthy()
      }
    }
  })
})
