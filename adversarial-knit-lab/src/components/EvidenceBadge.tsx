/** Evidence status indicator. "Evaluated" never implies "effective". */
import type { EvidenceStatus } from '../types/project'
import { EVIDENCE_HINTS, EVIDENCE_LABELS } from '../features/chart/project'

export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  return (
    <span className={`evidence evidence-${status}`} title={EVIDENCE_HINTS[status]}>
      <span className="evidence-dot" aria-hidden="true" />
      {EVIDENCE_LABELS[status]}
    </span>
  )
}

export function EvidenceNote({ status }: { status: EvidenceStatus }) {
  return <p className="hint">{EVIDENCE_HINTS[status]}</p>
}
