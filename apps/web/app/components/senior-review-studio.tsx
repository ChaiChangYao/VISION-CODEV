'use client';
import { useEffect, useRef, useState } from 'react';
import type { ProcedureGraph, ProcedureStep } from '@vision-codef/contracts';
import {
  publicationCandidate,
  restructureActions,
  reviewAction,
  reviseAction,
} from '../../src/lib/senior-review';
import styles from './senior-review-studio.module.css';
import { ReviewFrame } from './review-frame';
import { ReviewDictation } from './review-dictation';
import { reviewCopy, type ReviewLanguage } from '../../src/lib/review-language';
import {
  actionGroups,
  reviewCue,
  frameTarget,
  timelineMarkers,
  timeLabel,
} from '../../src/lib/review-timeline';

export function SeniorReviewStudio({
  graph,
  assetId,
  onChange,
  onSave,
  onPublish,
  onLoadMedia,
}: {
  graph: ProcedureGraph;
  assetId?: string;
  onChange: (graph: ProcedureGraph) => void;
  onSave: (graph: ProcedureGraph) => Promise<void>;
  onPublish: (graph: ProcedureGraph) => Promise<void>;
  onLoadMedia: (id: string) => Promise<Blob>;
}) {
  const [selected, setSelected] = useState(0);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | undefined>(undefined);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(30);
  const [zoom, setZoom] = useState(1);
  const [language, setLanguage] = useState<ReviewLanguage>('en');
  const copy = reviewCopy[language];
  const groups = actionGroups(graph.steps);
  const durationMs = graph.analysis?.durationMs ?? 1;
  const markers = timelineMarkers(graph.steps, durationMs);
  const lanes = Math.max(1, ...markers.map((marker) => marker.lane + 1));
  const seek = (ms: number) => {
    const target = Math.max(0, Math.min(durationMs, ms));
    if (video.current) {
      video.current.pause();
      video.current.currentTime = target / 1000;
    }
    setPlayhead(target);
  };
  const chooseAction = (index: number) => {
    setSelected(index);
    seek(graph.steps[index]?.evidenceStartMs ?? 0);
  };
  const stepFrame = (direction: -1 | 1) =>
    seek(
      frameTarget(
        video.current?.currentTime ?? playhead / 1000,
        direction,
        fps,
        durationMs / 1000,
      ) * 1000,
    );
  const step = graph.steps[selected];
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    if (assetId)
      void onLoadMedia(assetId)
        .then((blob) => {
          if (!cancelled) {
            objectUrl = URL.createObjectURL(blob);
            setUrl(objectUrl);
          }
        })
        .catch(() => setError('Video could not load. Your draft is preserved.'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, onLoadMedia]);
  useEffect(() => {
    if (step) seek(pendingSeek.current ?? step.evidenceStartMs ?? 0);
    pendingSeek.current = undefined;
  }, [step?.id]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (!saved && !graph.published) { event.preventDefault(); event.returnValue = ''; }
    };
    const preventNavigation = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]');
      if (!saved && !graph.published && link && !window.confirm('You have unsaved changes. Leave without saving your draft?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', prevent);
    document.addEventListener('click', preventNavigation, true);
    return () => { window.removeEventListener('beforeunload', prevent); document.removeEventListener('click', preventNavigation, true); };
  }, [saved, graph.published]);
  const change = (value: ProcedureGraph) => {
    onChange(value);
    setSaved(false);
  };
  const patch = (value: Partial<ProcedureStep>) => {
    if (step) change(reviseAction(graph, step.id, value));
  };
  const act = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const reviewed = graph.steps.filter((item) => item.seniorReview?.reviewed).length;
  return (
    <section className={styles.root}>
      <h2>{copy.title}</h2>
      <label>
        {copy.language}
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as ReviewLanguage)}
        >
          <option value="en">English</option>
          <option value="ms">Bahasa Melayu</option>
          <option value="zh-TW">繁體中文（台灣）</option>
        </select>
      </label>
      <small>
        {copy.hint} Core review labels are translated; advanced tools remain in English for this
        pilot.
      </small>
      <p>
        {reviewed} / {graph.steps.length} {copy.progress}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.layout}>
        <div>
          {url ? (
            <video
              ref={video}
              src={url}
              controls
              onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime * 1000)}
              onSeeked={(event) => setPlayhead(event.currentTarget.currentTime * 1000)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              style={{ width: '100%', maxHeight: 440, background: '#101819' }}
              onLoadedMetadata={() => {
                if (video.current) video.current.currentTime = (step?.evidenceStartMs ?? 0) / 1000;
              }}
            />
          ) : (
            <p>Loading original video…</p>
          )}
          <div className={styles.transport} aria-label="Video navigation">
            <button disabled={!url} onClick={() => stepFrame(-1)} aria-label="Previous frame">
              ← Frame
            </button>
            <button
              disabled={!url}
              onClick={() => {
                if (video.current?.paused)
                  void video.current.play().catch(() => setError('Playback could not start.'));
                else video.current?.pause();
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button disabled={!url} onClick={() => stepFrame(1)} aria-label="Next frame">
              Frame →
            </button>
            <output aria-label="Playhead time">
              {timeLabel(playhead)} / {timeLabel(durationMs)}
            </output>
          </div>
          <section className={styles.timeline} aria-label="Action timeline">
            <label>
              Timeline zoom
              <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
                {[1, 2, 4, 8].map((value) => (
                  <option key={value} value={value}>
                    {value === 1 ? 'Fit recording' : `${value}×`}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.timelineScroll}>
              <div style={{ width: `${zoom * 100}%` }}>
                <input
                  aria-label="Recording playhead"
                  type="range"
                  min="0"
                  max={durationMs}
                  step="1"
                  value={playhead}
                  onChange={(event) => seek(Number(event.target.value))}
                />
                <div className={styles.markerTracks} style={{ height: lanes * 30 }}>
                  {markers.map(({ index, lane, left, width }) => (
                    <button
                      key={graph.steps[index]!.id}
                      className={`${styles.actionMarker} ${selected === index ? styles.selectedMarker : ''}`}
                      style={{ left: `${left}%`, width: `${width}%`, top: lane * 30 }}
                      title={`${index + 1}. ${graph.steps[index]!.title}`}
                      aria-label={`Go to action ${index + 1}: ${graph.steps[index]!.title}`}
                      aria-pressed={selected === index}
                      onClick={() => chooseAction(index)}
                    >
                      {graph.steps[index]!.seniorReview?.reviewed ? '✓ ' : ''}
                      {index + 1}. {graph.steps[index]!.title}
                    </button>
                  ))}
                  <span
                    className={styles.playhead}
                    style={{ left: `${Math.min(100, (playhead / durationMs) * 100)}%` }}
                  />
                </div>
                <div className={styles.findingTrack} aria-label="Finding markers">
                  {graph.steps.flatMap((action, index) =>
                    (action.seniorReview?.findings ?? []).map((finding) => (
                      <button
                        key={finding.id}
                        className={styles.findingMarker}
                        style={{
                          left: `${Math.min(98, (finding.timestampMs / durationMs) * 100)}%`,
                        }}
                        title={finding.text || 'Untitled finding'}
                        aria-label={`Finding at ${timeLabel(finding.timestampMs)}: ${finding.text || 'Untitled finding'}`}
                        onClick={() => {
                          if (selected !== index) pendingSeek.current = finding.timestampMs;
                          setSelected(index);
                          seek(finding.timestampMs);
                        }}
                      >
                        ◆
                      </button>
                    )),
                  )}
                </div>
              </div>
            </div>
            <strong>
              {selected + 1}. {step?.title}
            </strong>
            {url && step && (
              <ReviewFrame url={url} timestampMs={step.keyframeMs ?? step.evidenceStartMs ?? 0} />
            )}
            <small>
              Bars = actions · ◆ = your notes · select to jump. Scroll sideways when zoomed.
            </small>
            <details>
              <summary>Frame-step settings</summary>
              <label>
                Recording frame rate
                <select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
                  {[24, 25, 30, 50, 60].map((value) => (
                    <option key={value} value={value}>
                      {value} fps
                    </option>
                  ))}
                </select>
              </label>
              <small>
                30 fps assumed. Match the source rate; variable-frame-rate footage may not step
                exactly one decoded frame.
              </small>
            </details>
          </section>
          <nav
            aria-label="Detected actions"
            style={{ maxHeight: 420, overflowY: 'auto', display: 'grid', gap: 6 }}
          >
            {groups.map((group, groupIndex) => (
              <details key={`${groupIndex}-${group.name}`} open={group.indices.includes(selected)}>
                <summary>
                  {group.name} ·{' '}
                  {
                    group.indices.filter((index) => graph.steps[index]!.seniorReview?.reviewed)
                      .length
                  }
                  /{group.indices.length} reviewed
                </summary>
                {group.indices.map((index) => {
                  const item = graph.steps[index]!;
                  return (
                    <button
                      key={item.id}
                      aria-current={selected === index ? 'step' : undefined}
                      onClick={() => chooseAction(index)}
                      style={{
                        textAlign: 'left',
                        padding: 12,
                        border: selected === index ? '2px solid #087f73' : '1px solid #ddd',
                        background: 'white',
                      }}
                    >
                      {item.seniorReview?.reviewed ? '✓ ' : ''}
                      {index + 1}. {item.title}
                      <small style={{ display: 'block' }}>
                        {((item.evidenceStartMs ?? 0) / 1000).toFixed(1)}–
                        {((item.evidenceEndMs ?? 0) / 1000).toFixed(1)}s ·{' '}
                        {item.seniorReview?.group}
                      </small>
                    </button>
                  );
                })}
              </details>
            ))}
          </nav>
        </div>
        <fieldset disabled={graph.published || busy} style={{ border: 0, padding: 0 }}>
          {step ? (
            <>
              <label>
                {copy.step}
                <input
                  style={{ width: '100%', marginBottom: 12 }}
                  value={step.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </label>
              <details>
                <summary>{copy.original}</summary>
                <p>{step.observedAction}</p>
              </details>
              <p className={styles.reviewCue}>{reviewCue(step)}</p>
              <label>
                {copy.instruction}
                <textarea
                  style={{ width: '100%', minHeight: 90 }}
                  value={step.instruction}
                  onChange={(e) => patch({ instruction: e.target.value })}
                />
              </label>
              <label style={{ marginTop: 14 }}>
                {copy.tip}
                <textarea
                  value={step.seniorReview?.reasoning ?? ''}
                  placeholder="For example: press the latch first; don't pull on the wires."
                  onChange={(event) =>
                    patch({
                      seniorReview: { ...step.seniorReview!, reasoning: event.target.value },
                    })
                  }
                />
              </label>
              <ReviewDictation
                key={`${step.id}-${language}`}
                language={language === 'en' ? 'en-MY' : language === 'ms' ? 'ms-MY' : 'zh-TW'}
                disabled={Boolean(graph.published || busy)}
                onText={(text) =>
                  patch({
                    seniorReview: {
                      ...step.seniorReview!,
                      reasoning: [step.seniorReview?.reasoning, text].filter(Boolean).join(' '),
                    },
                  })
                }
              />
              <details>
                <summary>{copy.extra}</summary>
                {(['completionCheck', 'documentReferences'] as const).map((key) => (
                  <label key={key} style={{ display: 'block', marginTop: 14 }}>
                    {
                      {
                        completionCheck: copy.check,
                        documentReferences: copy.references,
                      }[key]
                    }
                    <textarea
                      style={{ width: '100%' }}
                      value={step.seniorReview?.[key] ?? ''}
                      onChange={(e) =>
                        patch({ seniorReview: { ...step.seniorReview!, [key]: e.target.value } })
                      }
                    />
                  </label>
                ))}
              </details>
              <section className={styles.findings} aria-label="Timestamped findings">
                <h3>{copy.notes}</h3>
                <button
                  disabled={!url}
                  onClick={() =>
                    patch({
                      seniorReview: {
                        ...step.seniorReview!,
                        findings: [
                          ...(step.seniorReview?.findings ?? []),
                          { id: crypto.randomUUID(), timestampMs: Math.round(playhead), text: '' },
                        ],
                      },
                    })
                  }
                >
                  + {copy.note} · {timeLabel(playhead)}
                </button>
                {(step.seniorReview?.findings ?? []).length === 0 && (
                  <small>Pause at a moment and note what you noticed and why it matters.</small>
                )}
                {(step.seniorReview?.findings ?? []).map((finding) => (
                  <div key={finding.id}>
                    <button onClick={() => seek(finding.timestampMs)}>
                      ↗ {timeLabel(finding.timestampMs)}
                    </button>
                    <button
                      aria-label={`Remove finding at ${timeLabel(finding.timestampMs)}`}
                      onClick={() =>
                        patch({
                          seniorReview: {
                            ...step.seniorReview!,
                            findings: step.seniorReview!.findings!.filter(
                              (item) => item.id !== finding.id,
                            ),
                          },
                        })
                      }
                    >
                      Remove
                    </button>
                    <label>
                      {copy.why}
                      <textarea
                        value={finding.text}
                        onChange={(event) =>
                          patch({
                            seniorReview: {
                              ...step.seniorReview!,
                              findings: step.seniorReview!.findings!.map((item) =>
                                item.id === finding.id
                                  ? { ...item, text: event.target.value }
                                  : item,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    {url && (
                      <details>
                        <summary>Highlight something in this frame</summary>
                        <ReviewFrame
                          url={url}
                          timestampMs={finding.timestampMs}
                          region={finding.region}
                          disabled={graph.published || busy}
                          onRegion={(region) =>
                            patch({
                              seniorReview: {
                                ...step.seniorReview!,
                                findings: step.seniorReview!.findings!.map((item) =>
                                  item.id === finding.id ? { ...item, region } : item,
                                ),
                              },
                            })
                          }
                        />
                      </details>
                    )}
                  </div>
                ))}
              </section>
              <details style={{ margin: '16px 0' }}>
                <summary>{copy.adjust}</summary>
                <label>
                  Hand (verify against video)
                  <select
                    value={step.seniorReview?.hand ?? 'unknown'}
                    onChange={(e) =>
                      patch({
                        seniorReview: {
                          ...step.seniorReview!,
                          hand: e.target.value as 'left' | 'right' | 'both' | 'unknown',
                        },
                      })
                    }
                  >
                    {['unknown', 'left', 'right', 'both'].map((hand) => (
                      <option key={hand} value={hand}>
                        {hand}
                      </option>
                    ))}
                  </select>
                </label>
                {(['object', 'beforeState', 'afterState', 'uncertainty', 'group'] as const).map(
                  (key) => (
                    <label key={key}>
                      {
                        {
                          object: 'Object',
                          beforeState: 'Visible state before',
                          afterState: 'Visible state after',
                          uncertainty: 'Uncertainty',
                          group: 'Step group',
                        }[key]
                      }
                      <input
                        value={step.seniorReview?.[key] ?? ''}
                        onChange={(e) =>
                          patch({ seniorReview: { ...step.seniorReview!, [key]: e.target.value } })
                        }
                      />
                    </label>
                  ),
                )}
                <label>
                  Start (seconds)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={(step.evidenceStartMs ?? 0) / 1000}
                    onChange={(e) => {
                      const start = Math.round(Number(e.target.value) * 1000);
                      if (start >= 0 && start < step.evidenceEndMs!)
                        patch({
                          evidenceStartMs: start,
                          keyframeMs: Math.max(start, step.keyframeMs!),
                        });
                    }}
                  />
                </label>
                <label>
                  End (seconds)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={(step.evidenceEndMs ?? 0) / 1000}
                    onChange={(e) => {
                      const end = Math.round(Number(e.target.value) * 1000);
                      if (end > step.evidenceStartMs! && end <= graph.analysis!.durationMs)
                        patch({ evidenceEndMs: end, keyframeMs: Math.min(end, step.keyframeMs!) });
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    const middle = Math.round((step.evidenceStartMs! + step.evidenceEndMs!) / 2);
                    if (middle <= step.evidenceStartMs! || middle >= step.evidenceEndMs!) return;
                    const steps = [...graph.steps];
                    steps.splice(
                      selected,
                      1,
                      {
                        ...step,
                        evidenceEndMs: middle,
                        seniorReview: {
                          ...step.seniorReview!,
                          findings: (step.seniorReview?.findings ?? []).filter(
                            (finding) => finding.timestampMs < middle,
                          ),
                        },
                        keyframeMs: Math.round((step.evidenceStartMs! + middle) / 2),
                      },
                      {
                        ...step,
                        id: crypto.randomUUID(),
                        title: `${step.title} (second part)`,
                        seniorReview: {
                          ...step.seniorReview!,
                          findings: (step.seniorReview?.findings ?? []).filter(
                            (finding) => finding.timestampMs >= middle,
                          ),
                        },
                        evidenceStartMs: middle,
                        keyframeMs: Math.round((middle + step.evidenceEndMs!) / 2),
                      },
                    );
                    change(restructureActions(graph, steps));
                  }}
                >
                  Split action
                </button>
                <button
                  disabled={!graph.steps[selected + 1]}
                  onClick={() => {
                    const next = graph.steps[selected + 1]!;
                    const steps = [...graph.steps];
                    const end = Math.max(step.evidenceEndMs!, next.evidenceEndMs!);
                    steps.splice(selected, 2, {
                      ...step,
                      instruction: `${step.instruction}; ${next.instruction}`,
                      observedAction: `${step.observedAction}; ${next.observedAction}`,
                      seniorReview: {
                        ...step.seniorReview!,
                        findings: [
                          ...(step.seniorReview?.findings ?? []),
                          ...(next.seniorReview?.findings ?? []),
                        ],
                      },
                      evidenceEndMs: end,
                      keyframeMs: Math.round((step.evidenceStartMs! + end) / 2),
                    });
                    change(restructureActions(graph, steps));
                  }}
                >
                  Merge with next
                </button>
                <button
                  onClick={() => {
                    change(
                      restructureActions(
                        graph,
                        graph.steps.filter((item) => item.id !== step.id),
                      ),
                    );
                    setSelected(Math.max(0, selected - 1));
                  }}
                >
                  Remove action from draft
                </button>
              </details>
              <button
                disabled={
                  !step.title.trim() ||
                  !step.instruction.trim() ||
                  step.seniorReview?.findings?.some((finding) => !finding.text.trim())
                }
                onClick={() => {
                  change(reviewAction(graph, step.id));
                  if (selected < graph.steps.length - 1) chooseAction(selected + 1);
                }}
              >
                {step.seniorReview?.reviewed ? `${copy.reviewed} ✓` : copy.next}
              </button>
            </>
          ) : (
            <p>No actions in this draft. Add a missing action after watching the recording.</p>
          )}
          <button
            onClick={() => {
              const start = Math.min(
                Math.round((video.current?.currentTime ?? 0) * 1000),
                graph.analysis!.durationMs - 1,
              );
              const end = Math.min(graph.analysis!.durationMs, start + 2000);
              const action: ProcedureStep = {
                id: crypto.randomUUID(),
                ordinalHint: graph.steps.length,
                title: 'New action',
                instruction: 'Describe the action',
                observedAction: 'Added by senior reviewer',
                evidenceRefs: [],
                provenance: ['EXPERT_ASSERTION'],
                startState: [],
                endState: [],
                expectedAction: [],
                allowableVariations: [],
                deviationRules: [],
                recoveryTransitions: [],
                confidence: 0,
                evidenceStartMs: start,
                evidenceEndMs: end,
                keyframeMs: start,
                seniorReview: {
                  reviewed: false,
                  object: '',
                  hand: 'unknown',
                  beforeState: '',
                  afterState: '',
                  uncertainty: '',
                  group: '',
                  reasoning: '',
                  completionCheck: '',
                  documentReferences: '',
                },
              };
              const steps = [...graph.steps, action].sort(
                (a, b) => a.evidenceStartMs! - b.evidenceStartMs!,
              );
              change(restructureActions(graph, steps));
              setSelected(steps.findIndex((s) => s.id === action.id));
            }}
          >
            Add missing action at playhead
          </button>
        </fieldset>
      </div>
      <footer style={{ marginTop: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
        {graph.published ? (
          <strong>Published · read-only</strong>
        ) : (
          <>
            <button disabled={busy} onClick={() => void act(() => onSave(graph))}>
              {copy.save}
            </button>
            <span role="status">{saved ? copy.saved : copy.unsaved}</span>
            <button
              disabled={busy || !graph.steps.length || reviewed !== graph.steps.length}
              onClick={() => {
                if (window.confirm('Publish these reviewed actions as the approved procedure?'))
                  void act(() => onPublish(publicationCandidate(graph)));
              }}
            >
              {copy.publish}
            </button>
          </>
        )}
      </footer>
    </section>
  );
}
