'use client';

import { useState } from 'react';
import { Badge, Button, Card, Icon, StateNotice } from '@vision-codef/ui';
import { WorkflowHeader } from '../../../../components/workflow-navigation';

export default function TrainPage() {
  const [capturing, setCapturing] = useState(true);
  const [showRetry, setShowRetry] = useState(false);
  const [processed, setProcessed] = useState(false);

  return (
    <div>
      <WorkflowHeader stage="train" />
      <div className="surface-grid">
        <div className="side-stack">
          <Card className="surface-card">
            <div className="surface-card-header">
              <h2>Desktop monitor</h2>
              <span className="capture-status">
                <i /> {capturing ? 'Session active' : 'Session paused'}
              </span>
            </div>
            <div className="surface-card-body">
              <div className="monitor-stage" aria-label="LiveKit desktop monitor preview">
                <div className="monitor-grid" />
                <div className="monitor-placeholder">
                  <span>
                    <Icon name={capturing ? 'video' : 'cloud-off'} size={22} />
                  </span>
                  <strong>{capturing ? 'Waiting for phone video' : 'Capture is paused'}</strong>
                  <small>
                    {capturing
                      ? 'The browser is connected. Pair the Vision Codef mobile app to begin receiving the camera feed.'
                      : 'Resume the session when the phone is ready. Capture remains foreground-only.'}
                  </small>
                </div>
              </div>
              <div className="monitor-controls">
                <Button
                  id={capturing ? 'train-stop' : 'train-start'}
                  variant={capturing ? 'danger' : 'primary'}
                  onClick={() => {
                    setCapturing(!capturing);
                    if (capturing) setProcessed(false);
                  }}
                >
                  <Icon name={capturing ? 'stop' : 'play'} size={14} />{' '}
                  {capturing ? 'Stop capture' : 'Start capture'}
                </Button>
                {capturing && (
                  <Button variant="ghost" onClick={() => setShowRetry(true)}>
                    <Icon name="link" size={14} /> Pair phone
                  </Button>
                )}
                <span className="monitor-time">00:12:48</span>
              </div>
              {showRetry && (
                <div style={{ marginTop: 13 }}>
                  <StateNotice tone="amber" icon="link" title="Phone pairing is not connected">
                    This UI is ready for the LiveKit token and room from the capture service. No
                    media is being faked here.
                    <Button
                      id="train-retry"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRetry(false)}
                    >
                      Dismiss
                    </Button>
                  </StateNotice>
                </div>
              )}
            </div>
          </Card>
          <Card className="surface-card">
            <div className="surface-card-header">
              <h2>Capture timeline</h2>
              <Badge tone="neutral">Local preview</Badge>
            </div>
            <div className="surface-card-body">
              <div className="timeline">
                <div className="timeline-item">
                  <span className="timeline-time">00:00</span>
                  <span className="timeline-dot" />
                  <div>
                    <strong>Session prepared</strong>
                    <span>Desktop monitor is ready for a phone connection.</span>
                  </div>
                </div>
                <div className="timeline-item">
                  <span className="timeline-time">00:04</span>
                  <span className="timeline-dot" />
                  <div>
                    <strong>Audio route checked</strong>
                    <span>Bluetooth microphone will be preferred when available.</span>
                  </div>
                </div>
                <div className="timeline-item">
                  <span className="timeline-time">Now</span>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      {capturing
                        ? 'Waiting for first frame'
                        : processed
                          ? 'Media sent to processing'
                          : 'Capture stopped'}
                    </strong>
                    <span>
                      {processed
                        ? 'The recording is ready for transcript and observation extraction.'
                        : 'Only session metadata is present in this disconnected preview.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <div className="side-stack">
          <Card className="surface-card">
            <div className="surface-card-header">
              <h2>Capture details</h2>
            </div>
            <div className="surface-card-body">
              <div className="detail-list">
                <div className="device-pill">
                  <Icon name="video" size={18} />
                  <div>
                    <strong>Phone camera</strong>
                    <small>{capturing ? 'Awaiting connection' : 'Session ended'}</small>
                  </div>
                </div>
                <div className="detail-row">
                  <span>Source</span>
                  <strong>Mobile / rear camera</strong>
                </div>
                <div className="detail-row">
                  <span>Audio</span>
                  <strong>Bluetooth preferred</strong>
                </div>
                <div className="detail-row">
                  <span>Orientation</span>
                  <strong>Portrait</strong>
                </div>
                <div className="detail-row">
                  <span>Storage</span>
                  <strong>S3 Egress · canonical</strong>
                </div>
              </div>
            </div>
          </Card>
          <Card className="surface-card">
            <div className="surface-card-header">
              <h2>What happens next?</h2>
            </div>
            <div className="surface-card-body">
              <div className="process-list">
                <div className="process-step">
                  <span className="process-icon">
                    <Icon name="check" size={13} />
                  </span>
                  <span>Persist the LiveKit Egress recording</span>
                </div>
                <div className="process-step">
                  <span className={`process-icon ${!processed ? 'pending' : ''}`}>
                    <Icon name={processed ? 'check' : 'clock'} size={13} />
                  </span>
                  <span>Transcribe and extract observations</span>
                </div>
                <div className="process-step">
                  <span className="process-icon pending">
                    <Icon name="clock" size={13} />
                  </span>
                  <span>Draft an editable procedure graph</span>
                </div>
              </div>
              <Button
                className="full-button"
                variant="secondary"
                disabled={capturing}
                onClick={() => setProcessed(true)}
              >
                {processed ? 'Processing queued' : 'Stop and process'}{' '}
                <Icon name="arrow-right" size={14} />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
