'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Icon, StateNotice } from '@vision-codef/ui';
import { getApiClient, type CaptureSessionView, type DeploymentView, type LiveKitMonitor as LiveKitMonitorView, type ProcessingStatus, ApiClientError, isDemoFixturesEnabled } from '../../src/lib/api-client';
import type { ProcedureAnnotation, ProcedureAnnotationInput, ProcedureGraph, WorkflowReferencePack } from '@vision-codef/contracts';
import { demoGraph } from '../../src/lib/demo-data';
import { LiveKitMonitor } from './livekit-monitor';
import { AnnotationWorkbench } from './annotation-workbench';
import { ApplyReasoningStudio, EditReasoningStudio, TrainReasoningStudio } from './reasoning-studio-panels';
import { SeniorReviewStudio } from './senior-review-studio';
import { prioritizeCaptureSessions } from '../../src/lib/capture-selection';

type Stage = 'train' | 'processing' | 'approve' | 'deploy';

export function ConnectedGoldenRun({ workflowId, stage }: { workflowId: string; stage: Stage }) {
  const [capture, setCapture] = useState<CaptureSessionView>();
  const [monitor, setMonitor] = useState<LiveKitMonitorView>();
  const [processing, setProcessing] = useState<ProcessingStatus>();
  const [deployment, setDeployment] = useState<DeploymentView>();
  const [deploymentMonitor, setDeploymentMonitor] = useState<LiveKitMonitorView>();
  const [graph, setGraph] = useState<ProcedureGraph | undefined>(() => isDemoFixturesEnabled() ? demoGraph : undefined);
  const [reviewCaptures, setReviewCaptures] = useState<CaptureSessionView[]>([]);
  const [annotations, setAnnotations] = useState<ProcedureAnnotation[]>([]);
  const [referencePack, setReferencePack] = useState<WorkflowReferencePack>();
  const [selectedStep, setSelectedStep] = useState(0);
  const [instruction, setInstruction] = useState(() => isDemoFixturesEnabled() ? (demoGraph.steps[0]?.instruction ?? '') : '');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const api = useMemo(() => getApiClient(), []);

  const reportError = (value: unknown) => setError(value instanceof ApiClientError ? value.message : value instanceof Error ? value.message : String(value));
  const importPreset = async (presetId: string) => {
    if (importing) return;
    setImporting(true); setError(undefined); setMessage(undefined);
    try {
      const value = await api.importPreset(workflowId, presetId);
      setCapture(value); setMonitor(undefined); setProcessing(undefined);
      setMessage('Sample video added. Processing will create a draft for senior review.');
    } catch (value) { reportError(value); } finally { setImporting(false); }
  };
  const loadCapture = useCallback(async () => { if (!capture) return; try { setCapture(await api.getCaptureSession(capture.id)); } catch (value) { reportError(value); } }, [api, capture?.id]);
  const loadLatestCapture = useCallback(async () => { if (isDemoFixturesEnabled()) return; try { const captures = prioritizeCaptureSessions(await api.listCaptureSessions(workflowId)); setReviewCaptures(captures); setCapture((current) => current ?? captures[0]); } catch (value) { reportError(value); } }, [api, workflowId]);
  const loadProcessing = useCallback(async () => { if (isDemoFixturesEnabled()) return; try { const captures = prioritizeCaptureSessions(await api.listCaptureSessions(workflowId)); const latest = captures[0]; setReviewCaptures(captures); setCapture(latest); if (!latest) { setProcessing(undefined); return; } setProcessing(await api.getProcessing(latest.id)); } catch (value) { reportError(value); } }, [api, workflowId]);
  const loadGraph = useCallback(async () => {
    if (isDemoFixturesEnabled()) { setGraph(demoGraph); setInstruction(demoGraph.steps[0]?.instruction ?? ''); return; }
    try {
      if (stage === 'deploy') {
        const value = await api.getProcedureGraph(workflowId);
        setGraph(value); setInstruction(value.steps[0]?.instruction ?? '');
        return;
      }
      const [annotationValues, captureValues] = await Promise.all([api.listAnnotations(workflowId), api.listCaptureSessions(workflowId)]);
      const captures = prioritizeCaptureSessions(captureValues);
      const latest = captures[0];
      setAnnotations(annotationValues); setReviewCaptures(captures); setCapture(latest);
      if (latest?.processingStatus === 'blocked' || latest?.processingStatus === 'failed') {
        setError(undefined);
        setProcessing({ sessionId: latest.id, status: latest.processingStatus, progress: latest.mediaAsset?.state === 'available' ? 25 : 10, message: latest.processingBlockReason ?? 'The capture could not produce a reviewable procedure draft.', attempt: latest.processingAttemptCount ?? 0, maxAttempts: 5, canRetry: (latest.processingAttemptCount ?? 0) < 5 && Boolean(latest.mediaAsset) });
        return;
      }
      if (latest && latest.processingStatus !== 'completed') {
        setError(undefined);
        setProcessing(await api.getProcessing(latest.id));
        return;
      }
      const value = await api.getProcedureGraph(workflowId);
      setGraph(value); setInstruction(value.steps[0]?.instruction ?? '');
      try { setReferencePack(await api.getReferencePack(workflowId)); } catch (value) { if (!(value instanceof ApiClientError) || value.code !== 'NOT_FOUND') throw value; }
    } catch (value) { reportError(value); }
  }, [api, stage, workflowId]);
  const loadMonitor = useCallback(async () => { if (!capture) return; try { setMonitor(await api.getMonitor(capture.id)); } catch (value) { reportError(value); } }, [api, capture]);
  const loadDeployment = useCallback(async () => {
    if (isDemoFixturesEnabled()) return;
    try { setDeployment(await api.getCurrentDeployment(workflowId)); }
    catch (value) { if (!(value instanceof ApiClientError) || value.code !== 'NOT_FOUND') reportError(value); }
  }, [api, workflowId]);
  const loadDeploymentMonitor = useCallback(async () => {
    if (!deployment) return;
    try { setDeploymentMonitor(await api.getDeploymentMonitor(deployment.id)); } catch (value) { reportError(value); }
  }, [api, deployment?.id]);

  useEffect(() => { if (stage === 'train') void loadLatestCapture(); }, [stage, loadLatestCapture]);
  useEffect(() => {
    if (stage === 'train' && capture?.source === 'import' && processing?.sessionId !== capture.id) void loadProcessing();
  }, [capture?.id, capture?.source, loadProcessing, processing?.sessionId, stage]);
  useEffect(() => {
    if (stage !== 'train' || (capture?.state !== 'processing' && capture?.processingStatus !== 'submitted')) return;
    void loadProcessing();
    const timer = window.setInterval(() => void loadProcessing(), 2000);
    return () => window.clearInterval(timer);
  }, [capture?.id, capture?.processingStatus, capture?.state, loadProcessing, stage]);
  useEffect(() => { if (stage !== 'processing') return; void loadProcessing(); const timer = window.setInterval(() => void loadProcessing(), 3000); return () => window.clearInterval(timer); }, [stage, loadProcessing]);
  useEffect(() => {
    if (stage !== 'approve' && stage !== 'deploy') return;
    void loadGraph();
    if (stage !== 'approve' || graph) return;
    const timer = window.setInterval(() => void loadGraph(), 3000);
    return () => window.clearInterval(timer);
  }, [stage, loadGraph, graph?.id]);
  useEffect(() => {
    if (stage !== 'train' || !capture) return;
    const synchronizedPhoneState = capture.source === 'phone' && (
      capture.state === 'preparing' ||
      capture.state === 'active' ||
      capture.state === 'paused' ||
      capture.state === 'finalizing'
    );
    if (!synchronizedPhoneState) return;
    void loadCapture();
    const timer = window.setInterval(() => void loadCapture(), 2000);
    return () => window.clearInterval(timer);
  }, [capture?.id, capture?.pairedDeviceId, capture?.state, loadCapture, stage]);
  useEffect(() => { if (stage !== 'train' || capture?.state !== 'active') { setMonitor(undefined); return; } void loadMonitor(); const timer = window.setInterval(() => void loadMonitor(), 3000); return () => window.clearInterval(timer); }, [capture?.id, capture?.state, loadMonitor, stage]);
  useEffect(() => {
    if (stage !== 'deploy') return;
    void loadDeployment();
    const timer = window.setInterval(() => void loadDeployment(), 2000);
    return () => window.clearInterval(timer);
  }, [loadDeployment, stage]);
  useEffect(() => {
    if (stage !== 'deploy' || !deployment) { setDeploymentMonitor(undefined); return; }
    void loadDeploymentMonitor();
  }, [deployment?.id, loadDeploymentMonitor, stage]);

  const createCapture = async () => { try { setError(undefined); const value = await api.createCaptureSession(workflowId); setCapture(value); setMessage(value.pairingCode ? `Capture prepared. Enter pairing code ${value.pairingCode} in the native phone build.` : 'Capture session prepared. Open the native app to pair the phone.'); } catch (value) { reportError(value); } };
  const startCapture = async () => { if (!capture?.pairedDeviceId) { setError('Claim the capture session from the native phone before starting capture.'); return; } try { setCapture(await api.startCapture(capture.id)); setMessage('Capture is active. The desktop monitor is waiting for LiveKit tracks.'); } catch (value) { reportError(value); } };
  const stopCapture = async () => { if (!capture) return; try { setCapture(await api.stopCapture(capture.id)); setProcessing(await api.getProcessing(capture.id)); setMessage('Recording stopped. Waiting for the canonical MP4 to finish uploading.'); } catch (value) { reportError(value); } };
  const importCapture = async (file: File) => {
    setImporting(true); setError(undefined);
    try {
      if (!/\.mp4$/i.test(file.name)) throw new Error('Select an MP4 video file.');
      if (file.size > 2 * 1024 * 1024 * 1024) throw new Error('Imported videos must be 2 GiB or smaller.');
      const durationMs = await readVideoDurationMs(file);
      const value = await api.importCapture(workflowId, file, durationMs);
      setCapture(value); setReviewCaptures((current) => [value, ...current.filter((item) => item.id !== value.id)]);
      setProcessing(await api.getProcessing(value.id));
      setMessage(`${file.name} uploaded and queued for the same local visual processing as a phone capture.`);
    } catch (value) { reportError(value); } finally { setImporting(false); }
  };
  const retryProcessing = async () => {
    if (!capture) return;
    setRetrying(true); setError(undefined);
    try {
      const value = await api.retryProcessing(capture.id);
      setCapture(value);
      const status = await api.getProcessing(value.id);
      setProcessing(status);
      setMessage(`Processing restarted. Attempt ${status.attempt} of ${status.maxAttempts}.`);
    } catch (value) { reportError(value); } finally { setRetrying(false); }
  };
  const publish = async () => { if (!graph) { setError('A processed procedure graph is required before publication.'); return; } try { const value = await api.publishProcedure(workflowId, { graph: { ...graph, steps: graph.steps.map((step, index) => index === selectedStep ? { ...step, instruction } : step) }, reviewerNote: 'Reviewed and approved in the Approve surface.' }); setGraph(value); setMessage('Procedure published as an immutable version.'); } catch (value) { reportError(value); } };
  const saveAnnotation = async (input: ProcedureAnnotationInput, annotationId?: string) => { try { setError(undefined); const value = annotationId ? await api.updateAnnotation(annotationId, input) : await api.createAnnotation(workflowId, input); setAnnotations((current) => [...current.filter((annotation) => annotation.id !== value.id), value]); setMessage(`${value.verdict} example saved as ${value.reviewStatus}, revision ${value.revision}.`); } catch (value) { reportError(value); } };
  const publishReferencePack = async () => { try { setError(undefined); const value = await api.publishReferencePack(workflowId); setReferencePack(value); setMessage(`Reference pack v${value.version} published with ${value.entries.length} approved examples. Embeddings remain ${value.embeddingStatus.replace('_', ' ')}.`); } catch (value) { reportError(value); } };
  const startDeployment = async () => { try { setDeployment(await api.startDeployment(workflowId)); setMessage('Deployment is ready for the technician phone.'); } catch (value) { reportError(value); } };
  const recover = async () => { if (!deployment?.intervention) return; try { setDeployment(await api.requestRecovery(deployment.id, deployment.intervention.recoveryStepId)); setMessage('Approved recovery selected; the run returned to a valid state.'); } catch (value) { reportError(value); } };
  const runWrongFoldFixture = async () => { if (!deployment) return; const corners = [{ x: 0, y: 0 }, { x: 100, y: 2 }, { x: 98, y: 100 }, { x: 2, y: 98 }]; try { setError(undefined); await api.observeDeployment(deployment.id, { timestampMs: 0, corners, foldState: 'diagonal-left', visibilityScore: 0.95, alignmentScore: 0.95, handOccluded: false }); const result = await api.observeDeployment(deployment.id, { timestampMs: 800, corners, foldState: 'diagonal-left', visibilityScore: 0.95, alignmentScore: 0.95, handOccluded: false }); setDeployment(result); setMessage(result.decision === 'INTERRUPT' ? 'Controlled fixture produced the required persisted deviation intervention.' : `Fixture decision: ${result.decision}.`); } catch (value) { reportError(value); } };

  if (stage === 'approve' && !graph) return <div><Notice message={message} error={error} /><Card className="surface-card"><StateNotice tone="amber" icon="activity" title={processing?.status === 'blocked' || processing?.status === 'failed' ? 'Capture needs another run' : 'Waiting for processing'}>{processing?.message ?? 'The procedure graph becomes available after capture finalization and durable processing.'}</StateNotice></Card></div>;
  if (stage === 'processing') return <ProcessingPanel workflowId={workflowId} capture={capture} processing={processing} message={message} error={error} />;
  if (stage === 'approve' && graph?.analysis) return <SeniorReviewStudio graph={graph} assetId={reviewCaptures[0]?.mediaAsset?.id} onChange={setGraph} onSave={async (value) => { setGraph(await api.updateProcedureGraph(workflowId, value)); }} onPublish={async (value) => { setGraph(await api.publishProcedure(workflowId, { graph: value, reviewerNote: 'Senior reviewed every action in their recording and explicitly published the procedure.' })); }} onLoadMedia={api.getMediaContent} />;
  if (stage === 'approve') { const approvedGraph = graph!; return <><Notice message={message} error={error} /><EditReasoningStudio graph={approvedGraph} captures={reviewCaptures} annotations={annotations} referencePack={referencePack} selectedStep={selectedStep} instruction={instruction} setSelectedStep={(index) => { setSelectedStep(index); setInstruction(approvedGraph.steps[index]?.instruction ?? ''); }} setInstruction={setInstruction} onPublish={publish} onSaveAnnotation={saveAnnotation} onPublishReferencePack={publishReferencePack} onLoadMedia={api.getMediaContent} /></>; }
  if (stage === 'deploy') return <><Notice message={message} error={error} /><ApplyReasoningStudio graph={graph} deployment={deployment} monitor={deploymentMonitor} onStart={startDeployment} onRecover={recover} /></>;
  return <><Notice message={message} error={error} /><TrainReasoningStudio capture={capture} monitor={monitor} processing={processing} importing={importing} retrying={retrying} onCreate={createCapture} onImport={importCapture} onPreset={importPreset} onRetryProcessing={retryProcessing} onStart={startCapture} onStop={stopCapture} onLoadMedia={api.getMediaContent} /></>;
}

function Notice({ message, error }: { message?: string; error?: string }) { return <>{error ? <StateNotice tone="red" icon="info" title="Action could not complete">{error}</StateNotice> : null}{message ? <StateNotice tone="green" icon="check" title="Updated">{message}</StateNotice> : null}</>; }

function TrainPanel({ capture, monitor, processing, importing, onCreate, onImport, onStart, onStop, message, error }: { capture?: CaptureSessionView; monitor?: LiveKitMonitorView; processing?: ProcessingStatus; importing: boolean; onCreate: () => void; onImport: (file: File) => Promise<void>; onStart: () => void; onStop: () => void; message?: string; error?: string }) {
  const active = capture?.state === 'active';
  return <div><Notice message={message} error={error} /><div className="surface-grid"><Card className="surface-card"><div className="surface-card-header"><h2>Desktop monitor</h2><Badge tone={active ? 'green' : 'neutral'}>{active ? 'Session active' : 'Not connected'}</Badge></div><div className="surface-card-body">{monitor ? <LiveKitMonitor serverUrl={monitor.serverUrl} viewerToken={monitor.viewerToken} /> : <div className="monitor-stage" aria-label="LiveKit desktop monitor preview"><div className="monitor-grid" /><div className="monitor-placeholder"><Icon name={active ? 'video' : 'cloud-off'} size={24} /><strong>{active ? 'Waiting for phone video' : capture?.source === 'import' ? 'Video imported' : 'Create a capture session'}</strong><small>{active ? 'The API is ready for a physical phone publisher. No media is fabricated.' : capture?.source === 'import' ? capture.mediaAsset?.originalFilename ?? 'The imported capture is ready for review.' : 'The session must be prepared before the native phone can pair.'}</small></div></div>}<div className="monitor-controls">{!capture ? <Button id="train-create-session" data-interaction-id="train-create-session" variant="primary" onClick={onCreate}><Icon name="plus" size={14} /> Prepare capture</Button> : capture.state === 'preparing' ? <Button id="train-start-session" data-interaction-id="train-start-session" variant="primary" onClick={onStart} disabled={!capture.pairedDeviceId}><Icon name="play" size={14} /> {capture.pairedDeviceId ? 'Start capture' : 'Waiting for phone'}</Button> : capture.source !== 'import' ? <Button id="train-stop-session" data-interaction-id="train-stop-session" variant="danger" onClick={onStop} disabled={!active}><Icon name="stop" size={14} /> Stop and process</Button> : <Badge tone="green">Ready for review</Badge>}</div></div>{capture?.pairingCode ? <div className="pairing-instructions" role="status"><strong>Phone pairing code</strong><code>{capture.pairingCode}</code><small>{capture.pairedDeviceId ? 'Phone paired. Start capture when the phone is ready.' : 'Claim this session from the native build before starting capture.'}</small></div> : null}</Card><Card className="surface-card media-import-card"><div className="surface-card-header"><h2>Import existing video</h2><Badge tone="neutral">MP4 · max 2 GiB</Badge></div><div className="surface-card-body"><p className="lede">Use an existing expert recording as review evidence. Importing does not approve steps or train a model.</p><label className={`media-import-control${importing ? ' media-import-control-disabled' : ''}`}><Icon name="upload" size={15} /> {importing ? 'Importing video…' : 'Choose MP4 video'}<input type="file" accept="video/mp4,.mp4" disabled={importing} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void onImport(file); event.currentTarget.value = ''; }} /></label>{capture?.source === 'import' ? <small className="media-import-result"><strong>{capture.mediaAsset?.originalFilename}</strong> · {formatBytes(capture.mediaAsset?.sizeBytes)}</small> : null}</div></Card><Card className="surface-card"><div className="surface-card-header"><h2>Processing</h2><Badge tone={processing?.status === 'completed' ? 'green' : 'neutral'}>{processing?.status ?? 'Not started'}</Badge></div><div className="surface-card-body"><div className="progress-track"><i style={{ width: `${processing?.progress ?? 0}%` }} /></div><p className="lede">{processing?.message ?? 'Imported media remains available for manual annotation even when automated processing is not configured.'}</p></div></Card></div></div>;
}

function ProcessingPanel({ workflowId, capture, processing, message, error }: { workflowId: string; capture?: CaptureSessionView; processing?: ProcessingStatus; message?: string; error?: string }) {
  const blocked = processing?.status === 'blocked';
  const completed = processing?.status === 'completed';
  const stages = [
    { title: 'Media ingestion', detail: capture?.mediaAsset?.state === 'available' ? 'Canonical MP4 is available for review.' : 'Waiting for a durable media object.', complete: capture?.mediaAsset?.state === 'available' },
    { title: 'Transcript and observations', detail: blocked ? 'Not run. A processing provider and worker are required.' : 'Extracting temporal speech and visual evidence.', complete: completed },
    { title: 'Procedure draft', detail: blocked ? 'Manual draft and annotation remain available in Approve.' : 'Normalizing observations into a reviewable procedure graph.', complete: completed },
  ];
  return <div><Notice message={message} error={error} /><Card className="processing-hero"><div><p className="eyebrow">Pipeline status</p><h2>{completed ? 'Procedure draft ready' : blocked ? 'Manual review ready' : capture ? 'Processing capture' : 'Waiting for a capture'}</h2><p>{processing?.message ?? 'Import or record a Golden Run before processing can begin.'}</p></div><Badge tone={completed ? 'green' : blocked ? 'amber' : 'neutral'}>{processing?.status ?? 'not started'}</Badge></Card><div className="processing-stage-list">{stages.map((item, index) => <Card key={item.title} className="processing-stage"><span className={item.complete ? 'processing-stage-index processing-stage-complete' : 'processing-stage-index'}>{item.complete ? <Icon name="check" size={13} /> : index + 1}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></Card>)}</div>{capture ? <Card className="processing-next"><div><strong>{blocked ? 'Continue with governed manual review' : 'Review the generated draft'}</strong><p>Processing proposes evidence. A senior still verifies the procedure and every bounded finding.</p></div><a className="ui-button ui-button-primary ui-button-sm" href={`/workflows/${workflowId}/approve`}>Open Approve <Icon name="arrow-right" size={13} /></a></Card> : null}</div>;
}

function ApprovePanel({ graph, captures, annotations, referencePack, selectedStep, instruction, setSelectedStep, setInstruction, onPublish, onSaveAnnotation, onPublishReferencePack, onLoadMedia, message, error }: { graph: ProcedureGraph; captures: CaptureSessionView[]; annotations: ProcedureAnnotation[]; referencePack?: WorkflowReferencePack; selectedStep: number; instruction: string; setSelectedStep: (index: number) => void; setInstruction: (value: string) => void; onPublish: () => void; onSaveAnnotation: (input: ProcedureAnnotationInput, annotationId?: string) => Promise<void>; onPublishReferencePack: () => Promise<void>; onLoadMedia: (assetId: string) => Promise<Blob>; message?: string; error?: string }) {
  const step = graph.steps[selectedStep];
  return <div><Notice message={message} error={error} /><div className="approve-layout"><Card className="step-list"><div className="step-list-header"><h2>Procedure steps <Badge tone="neutral">{graph.steps.length}</Badge></h2></div>{graph.steps.map((value, index) => <button key={value.id} data-interaction-id="approve-step-select" className={index === selectedStep ? 'step-row step-row-active' : 'step-row'} onClick={() => setSelectedStep(index)}><span className="step-number">{index + 1}</span><span><strong>{value.title}</strong><small>{value.provenance.join(' · ')}</small></span></button>)}</Card><Card className="editor-card"><p className="eyebrow">Reviewer editor</p><h2>Make the instruction unambiguous</h2><div className="form-field"><label htmlFor="connected-step-instruction">Instruction</label><textarea id="connected-step-instruction" data-interaction-id="approve-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} /></div><div className="editor-footer"><small><Icon name="shield" size={13} /> Publication requires an explicit reviewer action.</small>{graph.published ? <Badge tone="green">Published v{graph.version}</Badge> : <Button id="connected-publish" data-interaction-id="connected-publish" variant="primary" onClick={onPublish} disabled={!instruction.trim()}><Icon name="check" size={14} /> Approve & publish</Button>}</div></Card></div>{step ? <AnnotationWorkbench key={step.id} step={step} expectedStateLabel={graph.states.find((state) => step.endState.includes(state.id))?.label} captures={captures} annotations={annotations} referencePack={referencePack} procedurePublished={graph.published} onSave={onSaveAnnotation} onPublishReferencePack={onPublishReferencePack} onLoadMedia={onLoadMedia} /> : null}</div>;
}

function readVideoDurationMs(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const video = document.createElement('video');
    const finish = (value?: number) => { URL.revokeObjectURL(url); video.remove(); resolve(value); };
    video.preload = 'metadata'; video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration * 1000 : undefined); video.onerror = () => finish(); video.src = url;
  });
}

function formatBytes(value?: number) { return value ? `${(value / 1024 / 1024).toFixed(1)} MB` : 'size unavailable'; }

function DeployPanel({ deployment, onStart, onRecover, onWrongFoldFixture, message, error }: { deployment?: DeploymentView; onStart: () => void; onRecover: () => void; onWrongFoldFixture: () => void; message?: string; error?: string }) {
  const complete = deployment?.status === 'completed';
  return <div><Notice message={message} error={error} /><div className="deploy-columns"><Card className="surface-card"><div className="surface-card-header"><h2>Live deployment</h2><Badge tone={complete ? 'green' : deployment ? 'amber' : 'neutral'}>{complete ? 'Complete' : deployment?.status ?? 'Ready'}</Badge></div><div className="surface-card-body">{!deployment ? <Button id="connected-deploy-start" data-interaction-id="connected-deploy-start" variant="primary" onClick={onStart}><Icon name="play" size={14} /> Start deployment</Button> : complete ? <StateNotice tone="green" icon="check" title="Run completed">The approved recovery returned the technician to a valid state.</StateNotice> : <><h2>{deployment.currentInstruction ?? 'Monitoring the current procedure state.'}</h2><p>Automatic monitoring remains active while interactive voice dialogue is closed.</p><small aria-live="polite">Voice channel: {deployment.voiceState ?? 'closed'}</small>{deployment.why ? <div id="connected-deploy-why" data-interaction-id="connected-deploy-why" className="why-box"><strong>Why?</strong><p>{deployment.why.text}</p><small>Provenance: {deployment.why.provenance.join(' · ')}{deployment.why.evidenceIds.length ? ' · Evidence: ' + deployment.why.evidenceIds.join(', ') : ''}</small></div> : null}{isDemoFixturesEnabled() ? <Button id="connected-wrong-fold-fixture" data-interaction-id="connected-wrong-fold-fixture" variant="secondary" onClick={onWrongFoldFixture}><Icon name="activity" size={14} /> Run wrong-fold fixture</Button> : null}{deployment.intervention ? <div className="alert-action" role="alert"><strong>{deployment.intervention.title}</strong><p>{deployment.intervention.detail}</p><Button id="connected-deploy-recover" data-interaction-id="connected-deploy-recover" variant="danger" onClick={onRecover}><Icon name="refresh" size={14} /> Interrupt and recover</Button></div> : null}</>}</div></Card></div></div>;
}
