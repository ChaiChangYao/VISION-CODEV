import type { ProcedureStep } from '@vision-codef/contracts';

/** Group consecutive actions only: repeated labels must not reorder evidence. */
export function actionGroups(steps: ProcedureStep[]) {
  const groups: { name: string; indices: number[] }[] = [];
  steps.forEach((step, index) => {
    const name = step.seniorReview?.group.trim() || 'Other actions';
    const previous = groups.at(-1);
    if (previous?.name === name) previous.indices.push(index);
    else groups.push({ name, indices: [index] });
  });
  return groups;
}

export function reviewCue(step: ProcedureStep) {
  const uncertainty = step.seniorReview?.uncertainty?.trim();
  if (uncertainty && !/^(low|medium|high|none|unknown|n\/a)[.!]?$/i.test(uncertainty))
    return `Check against the video: ${uncertainty}`;
  const checks = ['action and timing'];
  if (step.seniorReview?.object) checks.push(`part/tool name (${step.seniorReview.object})`);
  if (step.seniorReview?.hand && step.seniorReview.hand !== 'unknown')
    checks.push('left/right hand');
  return `Before reviewing, check the ${checks.join(', ')}. These are AI suggestions, not verified facts.`;
}

export function frameTarget(
  timeSeconds: number,
  direction: -1 | 1,
  fps: number,
  durationSeconds: number,
) {
  if (
    ![timeSeconds, fps, durationSeconds].every(Number.isFinite) ||
    fps <= 0 ||
    durationSeconds <= 0
  )
    return 0;
  const frame = Math.round(timeSeconds * fps) + direction;
  return Math.max(0, Math.min(Math.max(0, durationSeconds - 1 / fps), frame / fps));
}

export function timelineMarkers(steps: ProcedureStep[], durationMs: number) {
  const ends: number[] = [];
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => (a.step.evidenceStartMs ?? 0) - (b.step.evidenceStartMs ?? 0))
    .map(({ step, index }) => {
      const start = Math.max(0, Math.min(durationMs, step.evidenceStartMs ?? 0));
      const end = Math.max(start, Math.min(durationMs, step.evidenceEndMs ?? start));
      const displayEnd = Math.min(durationMs, Math.max(end, start + durationMs * 0.035));
      let lane = ends.findIndex((value) => value <= start);
      if (lane === -1) lane = ends.length;
      ends[lane] = displayEnd;
      return {
        index,
        lane,
        left: durationMs > 0 ? (start / durationMs) * 100 : 0,
        width: durationMs > 0 ? ((displayEnd - start) / durationMs) * 100 : 0,
      };
    });
}

export function timeLabel(ms: number) {
  const safe = Math.max(0, Math.round(ms));
  return `${Math.floor(safe / 60000)}:${((safe % 60000) / 1000).toFixed(2).padStart(5, '0')}`;
}
