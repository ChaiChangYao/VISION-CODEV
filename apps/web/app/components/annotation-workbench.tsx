'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Badge, Button, Card, Icon, StateNotice } from '@vision-codef/ui';
import type {
  ProcedureAnnotation,
  ProcedureAnnotationInput,
  ProcedureStep,
  WorkflowReferencePack,
} from '@vision-codef/contracts';
import type { CaptureSessionView } from '../../src/lib/api-client';

type Props = {
  step: ProcedureStep;
  expectedStateLabel?: string;
  captures: CaptureSessionView[];
  annotations: ProcedureAnnotation[];
  referencePack?: WorkflowReferencePack;
  procedurePublished: boolean;
  onSave: (input: ProcedureAnnotationInput, annotationId?: string) => Promise<void>;
  onPublishReferencePack: () => Promise<void>;
  onLoadMedia: (assetId: string) => Promise<Blob>;
};

type FormState = {
  captureSessionId: string;
  startMs: string;
  endMs: string;
  verdict: ProcedureAnnotationInput['verdict'];
  severity: NonNullable<ProcedureAnnotationInput['severity']>;
  confidence: string;
  objectName: string;
  observedAction: string;
  expectedState: string;
  failureType: string;
  expectedNextAction: string;
  reasoning: string;
  documentSourceId: string;
  documentPage: string;
  documentNote: string;
  reviewStatus: 'approved' | 'rejected';
};

const verdictLabels: Record<FormState['verdict'], string> = {
  correct: 'Correct',
  deviation: 'Deviation',
  uncertain: 'Uncertain',
};

export function AnnotationWorkbench({
  step,
  expectedStateLabel,
  captures,
  annotations,
  referencePack,
  procedurePublished,
  onSave,
  onPublishReferencePack,
  onLoadMedia,
}: Props) {
  const stepAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.stepId === step.id),
    [annotations, step.id],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const selected = stepAnnotations.find((annotation) => annotation.id === selectedId);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(step, captures[0]?.id, expectedStateLabel),
  );
  const baselineRef = useRef(serializeForm(form));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string>();
  const [mediaError, setMediaError] = useState<string>();
  const [mediaLoading, setMediaLoading] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [frameRate, setFrameRate] = useState(30);
  const [playbackRate, setPlaybackRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const selectedCapture = captures.find((capture) => capture.id === form.captureSessionId);
  const isDirty = serializeForm(form) !== baselineRef.current;
  const sourceUrls = evidenceSources(form.documentSourceId)
    .map(safeHttpUrl)
    .filter(Boolean) as string[];

  useEffect(() => {
    const assetId = selectedCapture?.mediaAsset?.contentAvailable
      ? selectedCapture.mediaAsset.id
      : undefined;
    if (!assetId) {
      setMediaUrl(undefined);
      setMediaError(undefined);
      return;
    }
    let active = true;
    let objectUrl: string | undefined;
    setMediaLoading(true);
    setMediaError(undefined);
    void onLoadMedia(assetId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setMediaUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (active)
          setMediaError(
            error instanceof Error ? error.message : 'The imported video could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setMediaLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [onLoadMedia, selectedCapture?.mediaAsset?.contentAvailable, selectedCapture?.mediaAsset?.id]);

  useEffect(() => {
    const first = stepAnnotations[0];
    const next = first
      ? annotationForm(first)
      : emptyForm(step, captures[0]?.id, expectedStateLabel);
    setSelectedId(first?.id);
    setForm(next);
    baselineRef.current = serializeForm(next);
  }, [captures, expectedStateLabel, step, stepAnnotations]);

  const selectAnnotation = (annotation: ProcedureAnnotation) => {
    if (!mayReplaceDraft(isDirty)) return;
    const next = annotationForm(annotation);
    setSelectedId(annotation.id);
    setForm(next);
    baselineRef.current = serializeForm(next);
    seekVideo(videoRef.current, annotation.startMs);
  };

  const markFinding = () => {
    if (!mayReplaceDraft(isDirty)) return;
    videoRef.current?.pause();
    const knownDuration = durationMs || selectedCapture?.durationMs || 0;
    const boundary = boundedRange(currentVideoMsNumber(videoRef.current), knownDuration);
    const clean = emptyForm(step, form.captureSessionId || captures[0]?.id, expectedStateLabel);
    setSelectedId(undefined);
    setForm({ ...clean, startMs: String(boundary.startMs), endMs: String(boundary.endMs) });
    baselineRef.current = serializeForm(clean);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(annotationInput(form, step.id, selected), selected?.id);
      baselineRef.current = serializeForm(form);
    } finally {
      setSaving(false);
    }
  };

  const publishPack = async () => {
    setPublishing(true);
    try {
      await onPublishReferencePack();
    } finally {
      setPublishing(false);
    }
  };

  const handleWorkbenchKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isEditableTarget(event.target)) return;
    const video = videoRef.current;
    if (!video) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (video.paused) void video.play();
      else video.pause();
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepVideoFrame(
        video,
        event.key === 'ArrowLeft' ? -1 : 1,
        frameRate,
        event.shiftKey ? 10 : 1,
      );
    }
  };

  const timelineDuration = durationMs || selectedCapture?.durationMs || 1;
  const approvedCount = annotations.filter(
    (annotation) => annotation.reviewStatus === 'approved',
  ).length;

  return (
    <Card className="annotation-workbench" onKeyDown={handleWorkbenchKeyDown} tabIndex={-1}>
      <div className="annotation-heading">
        <div>
          <p className="eyebrow">Expert video review</p>
          <h2>Ground the procedure in senior reasoning</h2>
          <p className="lede">
            Mark the exact moment, explain the evidence, and preserve it as a governed reference
            example.
          </p>
        </div>
        <div className="annotation-heading-status">
          <Badge tone={approvedCount > 0 ? 'green' : 'neutral'}>{approvedCount} approved</Badge>
          <span>Space play/pause · arrows step frames · Shift + arrows step 10</span>
        </div>
      </div>

      {captures.length === 0 ? (
        <StateNotice tone="amber" icon="video" title="No capture available">
          A captured session is required before a senior can ground an annotation in real media.
        </StateNotice>
      ) : null}

      <div className="annotation-review-shell">
        <section className="annotation-video-column" aria-label="Video annotation player">
          <div className="annotation-media-heading">
            <div>
              <strong>{selectedCapture?.mediaAsset?.originalFilename ?? 'Select a capture'}</strong>
              <small>
                {mediaLoading
                  ? 'Loading review media…'
                  : mediaUrl
                    ? `${formatTime(currentMs)} of ${formatTime(timelineDuration)}`
                    : 'Media preview unavailable'}
              </small>
            </div>
            <Badge tone={mediaUrl ? 'green' : 'neutral'}>
              {mediaUrl ? 'Ready to review' : 'Metadata only'}
            </Badge>
          </div>
          <div className="annotation-video-stage">
            {mediaError ? (
              <StateNotice tone="red" icon="info" title="Video unavailable">
                {mediaError}
              </StateNotice>
            ) : null}
            {mediaUrl ? (
              <video
                ref={videoRef}
                controls
                preload="metadata"
                src={mediaUrl}
                onLoadedMetadata={(event) =>
                  setDurationMs(Math.round(event.currentTarget.duration * 1000))
                }
                onTimeUpdate={(event) =>
                  setCurrentMs(Math.round(event.currentTarget.currentTime * 1000))
                }
              >
                Imported MP4 preview
              </video>
            ) : (
              <div className="annotation-video-empty">
                <Icon name="video" size={26} />
                <span>
                  {mediaLoading ? 'Preparing video…' : 'No playable media for this capture'}
                </span>
              </div>
            )}
          </div>

          <div className="annotation-playback-bar" aria-label="Frame playback controls">
            <Button variant="ghost" size="sm" onClick={() => stepVideoFrame(videoRef.current, -1, frameRate)}>Previous frame</Button>
            <Button variant="secondary" size="sm" onClick={() => toggleVideo(videoRef.current)}>{videoRef.current?.paused === false ? 'Pause' : 'Play'}</Button>
            <Button variant="ghost" size="sm" onClick={() => stepVideoFrame(videoRef.current, 1, frameRate)}>Next frame</Button>
            <span className="annotation-frame-readout">Frame {Math.max(0, Math.round(currentMs / 1000 * frameRate))} · {formatTime(currentMs)}</span>
            <label>FPS<select value={frameRate} onChange={(event) => setFrameRate(Number(event.target.value))}>{[24, 25, 30, 50, 60].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Speed<select value={playbackRate} onChange={(event) => { const rate = Number(event.target.value); setPlaybackRate(rate); if (videoRef.current) videoRef.current.playbackRate = rate; }}>{[0.25, 0.5, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
          </div>
          <input className="annotation-scrubber" aria-label="Video playhead" type="range" min="0" max={timelineDuration} step={1000 / frameRate} value={Math.min(currentMs, timelineDuration)} onChange={(event) => seekVideo(videoRef.current, Number(event.target.value))} />

          <div className="annotation-timeline-block">
            <div className="annotation-timeline-header">
              <span>Findings timeline</span>
              <Button variant="primary" size="sm" onClick={markFinding} disabled={!mediaUrl}>
                <Icon name="plus" size={13} /> Mark finding at {formatTime(currentMs)}
              </Button>
            </div>
            <div
              className="annotation-timeline-track"
              role="slider"
              aria-label="Video timeline"
              aria-valuemin={0}
              aria-valuemax={timelineDuration}
              aria-valuenow={currentMs}
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                seekVideo(
                  videoRef.current,
                  ((event.clientX - bounds.left) / bounds.width) * timelineDuration,
                );
              }}
            >
              <span
                className="annotation-timeline-progress"
                style={{ width: `${percent(currentMs, timelineDuration)}%` }}
              />
              {isFiniteRange(form) ? (
                <span
                  className="annotation-selected-range"
                  style={{
                    left: `${percent(Number(form.startMs), timelineDuration)}%`,
                    width: `${rangePercent(form, timelineDuration)}%`,
                  }}
                />
              ) : null}
              {stepAnnotations.map((annotation) => (
                <button
                  key={annotation.id}
                  type="button"
                  className={`annotation-timeline-marker annotation-marker-${annotation.verdict}${annotation.id === selectedId ? ' annotation-timeline-marker-active' : ''}`}
                  style={{ left: `${percent(annotation.startMs, timelineDuration)}%` }}
                  aria-label={`${verdictLabels[annotation.verdict]} finding at ${formatTime(annotation.startMs)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectAnnotation(annotation);
                  }}
                />
              ))}
              <span
                className="annotation-playhead"
                style={{ left: `${percent(currentMs, timelineDuration)}%` }}
              />
            </div>
            <div className="annotation-timeline-scale">
              <span>0:00</span>
              <span>{formatTime(timelineDuration)}</span>
            </div>
            <div className="annotation-range-editor">
              <label><span>Start {formatTime(Number(form.startMs))}</span><input aria-label="Finding start" type="range" min="0" max={timelineDuration} step={1000 / frameRate} value={Math.min(Number(form.startMs), timelineDuration)} onChange={(event) => update('startMs', String(Math.min(Number(event.target.value), Math.max(0, Number(form.endMs) - 1))))} /></label>
              <label><span>End {formatTime(Number(form.endMs))}</span><input aria-label="Finding end" type="range" min="0" max={timelineDuration} step={1000 / frameRate} value={Math.min(Number(form.endMs), timelineDuration)} onChange={(event) => update('endMs', String(Math.max(Number(event.target.value), Number(form.startMs) + 1)))} /></label>
            </div>
          </div>

          <div className="annotation-findings-list">
            {stepAnnotations.length === 0 ? (
              <p>No findings yet. Play the video and mark the first decision point.</p>
            ) : null}
            {stepAnnotations.map((annotation, index) => (
              <button
                key={annotation.id}
                type="button"
                className={
                  annotation.id === selectedId
                    ? 'annotation-row annotation-row-active'
                    : 'annotation-row'
                }
                onClick={() => selectAnnotation(annotation)}
              >
                <span className={`annotation-row-index annotation-index-${annotation.verdict}`}>
                  {index + 1}
                </span>
                <span className="annotation-row-copy">
                  <strong>{verdictLabels[annotation.verdict]}</strong>
                  <small>
                    {formatRange(annotation.startMs, annotation.endMs)} · {annotation.reviewStatus}
                  </small>
                </span>
                <Icon name="chevron-right" size={14} />
              </button>
            ))}
          </div>
        </section>

        <section
          className="annotation-finding-panel"
          aria-label="Selected finding"
          onFocusCapture={() => videoRef.current?.pause()}
        >
          <div className="annotation-panel-heading">
            <div>
              <p className="eyebrow">
                {selected ? `Finding · revision ${selected.revision}` : 'New finding'}
              </p>
              <h3>{formatRange(Number(form.startMs), Number(form.endMs))}</h3>
            </div>
            {isDirty ? (
              <Badge tone="amber">Unsaved</Badge>
            ) : (
              <Badge tone={selected?.reviewStatus === 'approved' ? 'green' : 'neutral'}>
                {selected ? selected.reviewStatus : 'Draft'}
              </Badge>
            )}
          </div>
          <div className="annotation-form">
            <Field label="Verdict">
              <div className="annotation-verdict-options">
                {(Object.keys(verdictLabels) as FormState['verdict'][]).map((verdict) => (
                  <button
                    key={verdict}
                    type="button"
                    className={`annotation-verdict annotation-verdict-${verdict}${form.verdict === verdict ? ' annotation-verdict-active' : ''}`}
                    onClick={() => update('verdict', verdict)}
                  >
                    <span />
                    {verdictLabels[verdict]}
                  </button>
                ))}
              </div>
            </Field>
            <Field
              label="Senior reasoning"
              hint="Required · describe the visible cue and why it matters"
            >
              <textarea
                value={form.reasoning}
                onChange={(event) => update('reasoning', event.target.value)}
                placeholder="At this moment, the record is… because…"
                rows={6}
              />
            </Field>

            <div className="annotation-grid annotation-grid-confidence">
              <Field label="Severity">
                <select value={form.severity} onChange={(event) => update('severity', event.target.value as FormState['severity'])}>
                  <option value="info">Information</option>
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical / stop work</option>
                </select>
              </Field>
              <Field label="Confidence">
                <select
                  value={form.confidence}
                  onChange={(event) => update('confidence', event.target.value)}
                >
                  <option value="1">1 · Low</option>
                  <option value="2">2 · Limited</option>
                  <option value="3">3 · Moderate</option>
                  <option value="4">4 · High</option>
                  <option value="5">5 · Certain</option>
                </select>
              </Field>
              <Field label="Review decision">
                <select
                  value={form.reviewStatus}
                  onChange={(event) =>
                    update('reviewStatus', event.target.value as FormState['reviewStatus'])
                  }
                >
                  <option value="approved">Approve example</option>
                  <option value="rejected">Reject example</option>
                </select>
              </Field>
            </div>

            <div className="annotation-evidence-card">
              <div className="annotation-evidence-heading">
                <Icon name="book" size={15} />
                <strong>Supporting documentation</strong>
                {sourceUrls.map((sourceUrl, index) => (
                  <a key={sourceUrl} href={sourceUrl} target="_blank" rel="noreferrer">
                    Source {index + 1} <Icon name="arrow-right" size={12} />
                  </a>
                ))}
              </div>
              <Field label="Manuals, SOPs, or controlled URLs" hint="One reference per line">
                <textarea
                  value={form.documentSourceId}
                  onChange={(event) => update('documentSourceId', event.target.value)}
                  placeholder={'Document ID or https://...\nOne reference per line'}
                  rows={3}
                />
              </Field>
              <div className="annotation-grid annotation-evidence-grid">
                <Field label="Page">
                  <input
                    inputMode="numeric"
                    value={form.documentPage}
                    onChange={(event) => update('documentPage', event.target.value)}
                  />
                </Field>
                <Field label="Evidence note">
                  <input
                    value={form.documentNote}
                    onChange={(event) => update('documentNote', event.target.value)}
                    placeholder="Requirement or diagram"
                  />
                </Field>
              </div>
            </div>

            <details className="annotation-details">
              <summary>
                <span>Technical annotation details</span>
                <Icon name="chevron-down" size={14} />
              </summary>
              <div className="annotation-details-body">
                <Field label="Capture">
                  <select
                    value={form.captureSessionId}
                    onChange={(event) => update('captureSessionId', event.target.value)}
                  >
                    {captures.map((capture) => (
                      <option key={capture.id} value={capture.id}>
                        {capture.mediaAsset?.originalFilename ?? capture.id.slice(0, 8)} ·{' '}
                        {capture.state}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="annotation-grid">
                  <Field label="Start (seconds)">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={msToSeconds(form.startMs)}
                      onChange={(event) => update('startMs', secondsToMs(event.target.value))}
                    />
                  </Field>
                  <Field label="End (seconds)">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={msToSeconds(form.endMs)}
                      onChange={(event) => update('endMs', secondsToMs(event.target.value))}
                    />
                  </Field>
                </div>
                <div className="annotation-boundary-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      update('startMs', String(currentVideoMsNumber(videoRef.current)))
                    }
                  >
                    Use playhead as start
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update('endMs', String(currentVideoMsNumber(videoRef.current)))}
                  >
                    Use playhead as end
                  </Button>
                </div>
                <div className="annotation-grid">
                  <Field label="Object or part">
                    <input
                      value={form.objectName}
                      onChange={(event) => update('objectName', event.target.value)}
                    />
                  </Field>
                  <Field label="Observed action">
                    <input
                      value={form.observedAction}
                      onChange={(event) => update('observedAction', event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Expected state">
                  <input
                    value={form.expectedState}
                    onChange={(event) => update('expectedState', event.target.value)}
                  />
                </Field>
                {form.verdict === 'deviation' ? (
                  <Field label="Failure type" hint="Required for deviations">
                    <input
                      value={form.failureType}
                      onChange={(event) => update('failureType', event.target.value)}
                      placeholder="e.g. wrong_orientation"
                    />
                  </Field>
                ) : null}
                <Field label="Recommended action">
                  <input
                    value={form.expectedNextAction}
                    onChange={(event) => update('expectedNextAction', event.target.value)}
                  />
                </Field>
              </div>
            </details>

            <div className="annotation-actions">
              <small>Schema v1 · the source video remains unchanged</small>
              <Button
                variant="primary"
                onClick={() => void save()}
                disabled={saving || !isComplete(form) || !isDirty}
              >
                <Icon name="check" size={14} />{' '}
                {saving ? 'Saving…' : selected ? 'Save revision' : 'Save finding'}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <div className="reference-pack-bar">
        <div>
          <strong>
            {referencePack
              ? `Reference pack v${referencePack.version}`
              : 'No reference pack published'}
          </strong>
          <small>
            {referencePack
              ? `${referencePack.entries.length} retrieval-ready examples · embeddings ${referencePack.embeddingStatus.replace('_', ' ')}`
              : 'Publish after the procedure and at least one annotation are approved.'}
          </small>
        </div>
        <Button
          variant="secondary"
          onClick={() => void publishPack()}
          disabled={publishing || !procedurePublished || approvedCount === 0}
        >
          <Icon name="upload" size={14} /> {publishing ? 'Publishing…' : 'Publish reference pack'}
        </Button>
      </div>
    </Card>
  );

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="annotation-field">
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

function emptyForm(
  step: ProcedureStep,
  captureSessionId = '',
  expectedStateLabel?: string,
): FormState {
  return {
    captureSessionId,
    startMs: '0',
    endMs: '3000',
    verdict: 'correct',
    severity: 'info',
    confidence: '4',
    objectName: step.title,
    observedAction: step.observedAction,
    expectedState: expectedStateLabel || step.endState.join(', ') || step.title,
    failureType: '',
    expectedNextAction: step.instruction,
    reasoning: '',
    documentSourceId: '',
    documentPage: '',
    documentNote: '',
    reviewStatus: 'approved',
  };
}

function annotationForm(annotation: ProcedureAnnotation): FormState {
  const evidence = annotation.documentEvidence[0];
  return {
    captureSessionId: annotation.captureSessionId,
    startMs: String(annotation.startMs),
    endMs: String(annotation.endMs),
    verdict: annotation.verdict,
    severity: annotation.severity ?? 'info',
    confidence: String(Math.max(1, Math.min(5, Math.round((annotation.confidence ?? 0.8) * 5)))),
    objectName: annotation.objectName,
    observedAction: annotation.observedAction,
    expectedState: annotation.expectedState,
    failureType: annotation.failureType ?? '',
    expectedNextAction: annotation.expectedNextAction,
    reasoning: annotation.reasoning,
    documentSourceId: annotation.documentEvidence.map((item) => item.sourceId).join('\n'),
    documentPage: evidence?.page ? String(evidence.page) : '',
    documentNote: evidence?.note ?? '',
    reviewStatus: annotation.reviewStatus === 'rejected' ? 'rejected' : 'approved',
  };
}

function annotationInput(
  form: FormState,
  stepId: string,
  existing?: ProcedureAnnotation,
): ProcedureAnnotationInput {
  const page = Number(form.documentPage);
  const evidence = evidenceSources(form.documentSourceId).map((sourceId, index) => ({
          sourceId,
          ...(Number.isInteger(page) && page > 0 ? { page } : {}),
          ...(form.documentNote.trim() ? { note: index === 0 ? form.documentNote.trim() : `Additional supporting reference: ${sourceId}` } : {}),
        }));
  return {
    stepId,
    captureSessionId: form.captureSessionId,
    startMs: Number(form.startMs),
    endMs: Number(form.endMs),
    verdict: form.verdict,
    severity: form.severity,
    confidence: Number(form.confidence) / 5,
    schemaVersion: 1,
    objectName: form.objectName.trim(),
    observedAction: form.observedAction.trim(),
    expectedState: form.expectedState.trim(),
    ...(form.failureType.trim() ? { failureType: form.failureType.trim() } : {}),
    expectedNextAction: form.expectedNextAction.trim(),
    reasoning: form.reasoning.trim(),
    documentEvidence: evidence,
    origin: existing?.origin ?? 'senior',
    ...(existing?.modelProposal ? { modelProposal: existing.modelProposal } : {}),
    reviewStatus: form.reviewStatus,
  };
}

function isComplete(form: FormState) {
  return Boolean(
    form.captureSessionId &&
    Number.isInteger(Number(form.startMs)) &&
    Number.isInteger(Number(form.endMs)) &&
    Number(form.endMs) > Number(form.startMs) &&
    Number(form.confidence) >= 1 &&
    Number(form.confidence) <= 5 &&
    form.objectName.trim() &&
    form.observedAction.trim() &&
    form.expectedState.trim() &&
    form.expectedNextAction.trim() &&
    form.reasoning.trim() &&
    (form.verdict !== 'deviation' || form.failureType.trim()),
  );
}

function serializeForm(form: FormState) {
  return JSON.stringify(form);
}
function mayReplaceDraft(isDirty: boolean) {
  return !isDirty || window.confirm('Discard the unsaved changes to this finding?');
}
function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}
function currentVideoMsNumber(video: HTMLVideoElement | null) {
  return Math.max(0, Math.round((video?.currentTime ?? 0) * 1000));
}
function seekVideo(video: HTMLVideoElement | null, milliseconds: number) {
  if (video)
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, milliseconds / 1000));
}
function toggleVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  if (video.paused) void video.play();
  else video.pause();
}
function stepVideoFrame(
  video: HTMLVideoElement | null,
  direction: -1 | 1,
  frameRate: number,
  frames = 1,
) {
  if (!video) return;
  video.pause();
  video.currentTime = Math.max(
    0,
    Math.min(video.duration || Infinity, video.currentTime + (direction * frames) / frameRate),
  );
}
function boundedRange(playheadMs: number, durationMs: number) {
  if (!durationMs) return { startMs: playheadMs, endMs: playheadMs + 3000 };
  const startMs = Math.min(playheadMs, Math.max(0, durationMs - 500));
  return { startMs, endMs: Math.max(startMs + 1, Math.min(durationMs, startMs + 3000)) };
}
function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, milliseconds) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const precision = seconds % 1 ? 1 : 0;
  return `${minutes}:${seconds.toFixed(precision).padStart(precision ? 4 : 2, '0')}`;
}
function formatRange(startMs: number, endMs: number) {
  return Number.isFinite(startMs) && Number.isFinite(endMs)
    ? `${formatTime(startMs)}–${formatTime(endMs)}`
    : 'Set a time range';
}
function percent(value: number, total: number) {
  return Math.max(0, Math.min(100, (value / Math.max(1, total)) * 100));
}
function isFiniteRange(form: FormState) {
  return Number.isFinite(Number(form.startMs)) && Number.isFinite(Number(form.endMs));
}
function rangePercent(form: FormState, duration: number) {
  return Math.max(0.35, percent(Number(form.endMs) - Number(form.startMs), duration));
}
function msToSeconds(value: string) {
  return value === '' ? '' : String(Number(value) / 1000);
}
function secondsToMs(value: string) {
  return value === '' ? '' : String(Math.max(0, Math.round(Number(value) * 1000)));
}
function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
function evidenceSources(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
