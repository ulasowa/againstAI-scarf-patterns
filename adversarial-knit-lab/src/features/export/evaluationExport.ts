/**
 * Evaluation exports.
 *
 * Both formats carry the full provenance: which chart, which model, which
 * preprocessing, which thresholds, which images, which transformation seeds and
 * which split. A number without those is not a measurement.
 */
import type { EvaluationRecord } from '../../types/project'
import { aggregate } from '../evaluation/metrics'

export function evaluationToJson(record: EvaluationRecord): string {
  return JSON.stringify(
    {
      format: 'adversarial-knit-lab.evaluation',
      version: 1,
      exportedAt: new Date().toISOString(),
      note: 'Measurements describe this chart, this model and these settings. "Evaluated" does not mean "effective".',
      record,
      splits: {
        optimization: aggregate(record.perExample, record.conditions, { split: 'optimization' }),
        holdout: aggregate(record.perExample, record.conditions, { split: 'holdout' }),
      },
    },
    null,
    2,
  )
}

const CSV_COLUMNS = [
  'record_id',
  'created_at',
  'pattern_hash',
  'model_id',
  'model_variant',
  'backend',
  'detection_threshold',
  'match_iou',
  'image_id',
  'image_file',
  'image_hash',
  'split',
  'transform_index',
  'transform_seed',
  'condition',
  'inference_ok',
  'failure_reason',
  'detected',
  'matched_score',
  'matched_x',
  'matched_y',
  'matched_width',
  'matched_height',
  'candidate_count',
] as const

export function evaluationToCsv(record: EvaluationRecord): string {
  const rows: string[] = [CSV_COLUMNS.join(',')]
  const imageById = new Map(record.images.map((image) => [image.id, image]))

  for (const example of record.perExample) {
    const image = imageById.get(example.imageId)
    for (const measurement of example.conditions) {
      const matched = measurement.matched
      rows.push(
        [
          record.id,
          record.createdAt,
          record.patternHash,
          record.model.id,
          record.model.variant,
          record.runtime.backend,
          record.thresholds.detection,
          record.thresholds.matchIou,
          example.imageId,
          image?.fileName ?? '',
          image?.contentHash ?? '',
          example.split,
          example.transformIndex,
          example.transformSeed,
          measurement.condition,
          measurement.inferenceOk ? 'true' : 'false',
          measurement.failureReason ?? '',
          // Blank rather than 0 when inference failed: "failed" is not "missed".
          measurement.inferenceOk ? (matched ? 'true' : 'false') : '',
          matched ? matched.score.toFixed(6) : '',
          matched ? matched.box.x.toFixed(2) : '',
          matched ? matched.box.y.toFixed(2) : '',
          matched ? matched.box.width.toFixed(2) : '',
          matched ? matched.box.height.toFixed(2) : '',
          measurement.candidates.length,
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return rows.join('\n')
}

function csvCell(value: string | number | boolean): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
