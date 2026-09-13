'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Icon, StateNotice } from '@vision-codef/ui';
import type { ProcedureAnnotation, ProcedureAnnotationInput, ProcedureGraph, WorkflowReferencePack } from '@vision-codef/contracts';
import type { CaptureSessionView, DeploymentView, LiveKitMonitor as LiveKitMonitorView, ProcessingStatus } from '../../src/lib/api-client';
import { LiveKitMonitor } from './livekit-monitor';
import { AnnotationWorkbench } from './annotation-workbench';

type TrainProps = {
  capture?: CaptureSessionView;
  monitor?: LiveKitMonitorView;
  processing?: ProcessingStatus;
  importing: boolean;
  retrying: boolean;
  onCreate: () => void;
  onImport: (file: File) => Promise<void>;
  onRetryProcessing: () => Promise<void>;
  onStart: () => void;
  onStop: () => void;
  onLoadMedia: (assetId: string) => Promise<Blob>;
};

export function TrainReasoningStudio({ capture, monitor, processing, importing, retrying, onCreate, onImport, onRetryProcessing, onStart, onStop, onLoadMedia }: TrainProps) {
  const active = capture?.state === 'active';
  const imported = capture?.source === 'import';
  const processingImport = imported && !['completed', 'blocked', 'failed'].includes(processing?.status ?? 'queued');
  const importReady = imported && processing?.status === 'completed';
  const importFailed = imported && (processing?.status === 'blocked' || processing?.status === 'failed');
  const importStatus = importing ? 'Uploading MP4' : processingImport ? `Processing MP4 · ${processing?.progress ?? 25}%` : importReady ? 'Procedure draft ready' : importFailed ? 'Processing needs attention' : 'Upload an MP4';
  const [mediaUrl, setMediaUrl] = useState<string>();

  useEffect(() => {
    const assetId = capture?.source === 'import' ? capture.mediaAsset?.id : undefined;
    if (!assetId) { setMediaUrl(undefined); return; }
    let url: string | undefined;
    let cancelled = false;
    void onLoadMedia(assetId).then((blob) => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setMediaUrl(url);
    }).catch(() => setMediaUrl(undefined));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [capture?.mediaAsset?.id, capture?.source, onLoadMedia]);

  return (
    <div className="reasoning-studio train-studio">
      <section className="studio-canvas" aria-label="Expert capture evidence">
        <div className="studio-kicker-row"><span><i className={active || processingImport ? 'live' : ''} />{active ? 'Phone camera live' : imported ? importStatus : 'Senior body camera'}</span><small>{active ? 'Adaptive video · audio on' : imported && processingImport ? 'Local vision analysis running' : mediaUrl ? 'Raw MP4 evidence' : 'Awaiting evidence'}</small></div>
        <div className="studio-video-stage">
          {monitor ? <LiveKitMonitor serverUrl={monitor.serverUrl} viewerToken={monitor.viewerToken} /> : mediaUrl ? <video controls preload="metadata" src={mediaUrl}>Imported expert recording</video> : (
            <div className="studio-empty-video"><Icon name={active ? 'video' : 'camera'} size={31} /><strong>{active ? 'Waiting for the phone video track' : 'Record or import the expert run'}</strong><p>Raw media stays preserved as the source of truth.</p></div>
          )}
          <span className="studio-video-condition"><Icon name="info" size={11} /> No model overlays</span>
          <div className="studio-video-status"><span><Icon name={active ? 'stop' : processingImport ? 'activity' : 'play'} size={12} />{active ? 'Capturing video, voice and observed action' : processingImport ? `Analyzing uploaded MP4 · ${processing?.progress ?? 25}%` : importReady ? 'Uploaded run processed and ready for review' : mediaUrl ? 'Expert run ready for review' : 'Capture not started'}</span><small>{capture?.durationMs ? formatDuration(capture.durationMs) : 'raw evidence'}</small></div>
        </div>

        <div className="studio-evidence-cards">
          <article><span className="studio-card-label"><i /> Mic transcript</span><p>{processing?.status === 'completed' ? 'Transcript generated and ready for review.' : processingImport ? 'Queued with the uploaded recording.' : 'Not generated. Audio remains available in the raw recording.'}</p></article>
          <article><span className="studio-card-label ai"><i /> AI scene observation</span><p>{processing?.status === 'completed' ? 'Temporal visual observations are ready.' : processingImport ? 'Qwen is analyzing representative frames locally.' : importFailed ? processing?.message ?? 'Processing could not complete.' : 'Not run. No visual interpretation is being implied.'}</p></article>
        </div>
      </section>

      <aside className="studio-inspector" aria-label="Capture configuration">
        <div className="studio-inspector-heading"><div><span className="studio-overline">Train · expert capture</span><h2>Record or upload the perfect run</h2></div><Badge tone={active ? 'red' : processingImport ? 'amber' : importFailed ? 'red' : capture ? 'green' : 'neutral'}>{active ? 'recording' : imported ? importStatus : capture ? capture.state : 'ready'}</Badge></div>

        <section className="studio-inspector-card warm"><span className="studio-overline">Capture brief</span><h3>{capture?.mediaAsset?.originalFilename ?? 'Expert procedure recording'}</h3><p>Perform the procedure normally. Narrate the checks an experienced technician makes but a manual may not explain.</p><dl><div><dt>Evidence</dt><dd>{capture?.source === 'import' ? 'Imported MP4' : 'Phone capture'}</dd></div><div><dt>State</dt><dd>{capture?.state ?? 'Not started'}</dd></div><div><dt>Size</dt><dd>{formatBytes(capture?.mediaAsset?.sizeBytes)}</dd></div></dl></section>

        {imported ? <section className="studio-inspector-section studio-import-processing" aria-live="polite"><div className="studio-section-title"><Icon name={importReady ? 'check' : importFailed ? 'info' : 'activity'} size={15} /><span><small>Uploaded MP4 pipeline</small><strong>{importStatus}</strong></span></div><div className="progress-track"><i style={{ width: `${processing?.progress ?? (processingImport ? 25 : 0)}%` }} /></div><p className="studio-honest-state">{processing?.message ?? 'The file is preserved first, then representative frames are analyzed by the local vision model.'}</p>{processing ? <small>Attempt {processing.attempt} of {processing.maxAttempts} · worker activities retry automatically up to five times</small> : null}{importFailed && processing?.canRetry ? <Button variant="secondary" onClick={onRetryProcessing} disabled={retrying}><Icon name="refresh" size={12} />{retrying ? 'Retrying…' : `Retry processing (${Math.max(0, processing.maxAttempts - processing.attempt)} left)`}</Button> : null}{importReady ? <a href="./approve" className="studio-text-action"><Icon name="arrow-right" size={12} /> Review generated procedure</a> : null}</section> : null}

        <section className="studio-inspector-section"><div className="studio-section-title"><Icon name="book" size={15} /><span><small>Source pack</small><strong>No controlled references attached</strong></span></div><p className="studio-honest-state">Documents can be linked during senior review. The video alone is not treated as an approved SOP.</p><a href="/documents" className="studio-text-action"><Icon name="plus" size={12} /> Attach a controlled document</a></section>

        <section className="studio-inspector-section"><span className="studio-overline">Optional narration cues</span><ul className="studio-prompt-list"><li>What are you checking right now?</li><li>What mistake looks correct at first glance?</li><li>What makes you stop and redo this step?</li></ul><small>These are prompts, not a script. Silence is preserved when the action is self-explanatory.</small></section>

        <div className="studio-inspector-actions">
          {!capture ? <Button variant="primary" onClick={onCreate}><Icon name="video" size={14} /> Prepare phone capture</Button> : capture.state === 'preparing' ? <Button variant="primary" onClick={onStart} disabled={!capture.pairedDeviceId}><Icon name="play" size={14} />{capture.pairedDeviceId ? 'Start recording' : 'Waiting for phone'}</Button> : active ? <Button variant="danger" onClick={onStop}><Icon name="stop" size={14} /> Stop and process</Button> : capture.source === 'phone' ? <Button variant="primary" onClick={onCreate}><Icon name="video" size={14} /> Prepare another capture</Button> : <Badge tone={importFailed ? 'red' : processingImport ? 'amber' : 'green'}>{importStatus}</Badge>}
          <label className={`studio-import-button${importing || processingImport ? ' disabled' : ''}`}><Icon name="upload" size={14} />{importing ? 'Uploading MP4…' : processingImport ? 'Processing MP4…' : 'Upload & process MP4'}<input type="file" accept="video/mp4,.mp4" disabled={importing || processingImport} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void onImport(file); event.currentTarget.value = ''; }} /></label>
        </div>
      </aside>
    </div>
  );
}

type EditProps = {
  graph: ProcedureGraph;
  captures: CaptureSessionView[];
  annotations: ProcedureAnnotation[];
  referencePack?: WorkflowReferencePack;
  selectedStep: number;
  instruction: string;
  setSelectedStep: (index: number) => void;
  setInstruction: (value: string) => void;
  onPublish: () => void;
  onSaveAnnotation: (input: ProcedureAnnotationInput, annotationId?: string) => Promise<void>;
  onPublishReferencePack: () => Promise<void>;
  onLoadMedia: (assetId: string) => Promise<Blob>;
};

export function EditReasoningStudio(props: EditProps) {
  const step = props.graph.steps[props.selectedStep];
  return (
    <div className="edit-studio">
      <div className="edit-studio-bar">
        <div><h2>Review synchronized evidence</h2></div>
        <span>{props.selectedStep + 1} of {props.graph.steps.length} moments reviewed</span>
      </div>
      <nav className="procedure-moment-strip" aria-label="Procedure moments">
        {props.graph.steps.map((item, index) => <button key={item.id} className={index === props.selectedStep ? 'active' : ''} onClick={() => props.setSelectedStep(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{item.keyframeMs === undefined ? `${Math.round(item.confidence * 100)}% source confidence` : `${formatMoment(item.keyframeMs)} · ${Math.round(item.confidence * 100)}% confidence`}</small></button>)}
      </nav>
      {step ? <AnnotationWorkbench key={step.id} step={step} expectedStateLabel={props.graph.states.find((state) => step.endState.includes(state.id))?.label} captures={props.captures} annotations={props.annotations} referencePack={props.referencePack} procedurePublished={props.graph.published} onSave={props.onSaveAnnotation} onPublishReferencePack={props.onPublishReferencePack} onLoadMedia={props.onLoadMedia} /> : null}
      <div className="edit-publish-bar"><div><Icon name="shield" size={14} /><span><strong>Procedure instruction</strong><small>Publishing requires explicit senior approval.</small></span></div><textarea aria-label="Approved procedure instruction" value={props.instruction} onChange={(event) => props.setInstruction(event.target.value)} />{props.graph.published ? <Badge tone="green">Published v{props.graph.version}</Badge> : <Button variant="primary" onClick={props.onPublish} disabled={!props.instruction.trim()}><Icon name="check" size={14} /> Approve procedure</Button>}</div>
    </div>
  );
}

function formatMoment(milliseconds: number) {
  const totalSeconds = Math.max(0, milliseconds) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(seconds % 1 ? 1 : 0).padStart(seconds % 1 ? 4 : 2, '0')}`;
}

type ApplyProps = { graph?: ProcedureGraph; deployment?: DeploymentView; monitor?: LiveKitMonitorView; onStart: () => void; onRecover: () => void };

export function ApplyReasoningStudio({ graph, deployment, monitor, onStart, onRecover }: ApplyProps) {
  const complete = deployment?.status === 'completed';
  const currentTitle = deployment?.currentInstruction ?? graph?.steps[0]?.instruction ?? 'Start a deployment to load approved guidance.';
  return (
    <div className="reasoning-studio apply-studio">
      <section className="studio-canvas">
        <div className="studio-kicker-row"><span><i className={deployment ? 'live' : ''} />Technician camera</span><small>{deployment ? 'Guidance session active' : 'No live media connected'}</small></div>
        <div className="studio-video-stage apply-video-stage">{monitor?.viewerToken ? <LiveKitMonitor serverUrl={monitor.serverUrl} viewerToken={monitor.viewerToken} /> : <div className="studio-empty-video"><Icon name="video" size={31} /><strong>{deployment ? 'Waiting for technician video' : 'Live field video is not connected'}</strong><p>No object detection or visual match is being simulated.</p></div>}<div className="studio-video-status"><span><Icon name="activity" size={12} />{deployment ? 'Procedure guidance active' : 'Guidance idle'}</span><small>{deployment?.voiceState ?? 'voice closed'}</small></div></div>
        <section className="procedure-progress"><div><span>Procedure progress</span><small>{graph?.steps.length ? `Step 1 of ${graph.steps.length}` : 'No published graph loaded'}</small></div><div className="procedure-progress-steps">{graph?.steps.slice(0, 5).map((step, index) => <span key={step.id} className={index === 0 ? 'active' : ''}><b>{String(index + 1).padStart(2, '0')}</b>{step.title}</span>)}</div></section>
      </section>
      <aside className="studio-inspector"><div className="studio-inspector-heading"><div><span className="studio-overline">Current guidance</span><h2>{complete ? 'Run completed' : currentTitle}</h2></div><Badge tone={complete ? 'green' : deployment ? 'amber' : 'neutral'}>{complete ? 'complete' : deployment ? 'active' : 'ready'}</Badge></div>
        {!deployment ? <section className="studio-inspector-card warm"><h3>Approved guidance is ready</h3><p>Start a deployment when the technician device and procedure are ready. Live visual detection is not configured.</p><Button variant="primary" onClick={onStart}><Icon name="play" size={14} /> Start deployment</Button></section> : null}
        {deployment?.pairingCode ? <section className="pairing-instructions" role="status"><strong>Tutorial code</strong><code>{deployment.pairingCode}</code><small>{deployment.pairedDeviceId ? 'Phone paired. Keep the tutorial app open and point the rear camera at the task.' : 'Open the APK, choose Run tutorial, and enter this code.'}</small><Button variant="secondary" onClick={onStart}><Icon name="refresh" size={12} /> New tutorial code</Button></section> : null}
        {deployment?.intervention ? <section className="studio-warning" role="alert"><div><Icon name="info" size={16} /><span><strong>{deployment.intervention.title}</strong><small>Approved recovery required</small></span></div><p>{deployment.intervention.detail}</p><Button variant="primary" onClick={onRecover}>Use approved recovery</Button></section> : null}
        {deployment?.why ? <section className="studio-inspector-section senior-note"><div className="studio-section-title"><Icon name="sparkles" size={15} /><span><small>Approved senior note</small><strong>Procedure evidence</strong></span></div><blockquote>{deployment.why.text}</blockquote><small>{deployment.why.provenance.join(' · ')}</small></section> : null}
        <section className="studio-inspector-section"><div className="studio-section-title"><Icon name="book" size={15} /><span><small>Procedure evidence</small><strong>Required checks for this step</strong></span></div>{graph?.steps[0]?.deviationRules.length ? <ul className="studio-check-list">{graph.steps[0].deviationRules.slice(0, 4).map((rule) => <li key={rule}><Icon name="check" size={13} />{rule}</li>)}</ul> : <p className="studio-honest-state">No step checks are available.</p>}</section>
      </aside>
    </div>
  );
}

function formatBytes(value?: number) { return value ? `${(value / 1024 / 1024).toFixed(1)} MB` : 'Not available'; }
function formatDuration(value: number) { const seconds = Math.round(value / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
