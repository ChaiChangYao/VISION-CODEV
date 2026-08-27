'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Icon } from '@vision-codef/ui';
import { DEMO_IDS } from '../../../src/lib/demo-data';

export default function NewChatPage() {
  const router = useRouter();
  const [brief, setBrief] = useState(
    'Capture the expert way to fold a paper crane, then guide another person through the approved sequence.',
  );
  const [submitted, setSubmitted] = useState(false);
  const [family, setFamily] = useState<'golden_run' | 'ambiguous'>('golden_run');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (family === 'golden_run' && brief.trim())
      router.push(`/workflows/${DEMO_IDS.workflow}/train`);
  }

  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">New Chat</p>
          <h1>What are we building?</h1>
          <p className="lede">
            Describe the work in plain language. Vision Codef will route it to a Golden Run or ask
            for the missing context.
          </p>
        </div>
        <Badge tone="blue">Contract v0.1</Badge>
      </div>
      <div className="composer-layout">
        <Card className="composer-card">
          <form onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="workflow-brief">Workflow brief</label>
              <textarea
                id="workflow-brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="For example: capture how our lead technician inspects a brake assembly…"
                aria-describedby="brief-help"
              />
            </div>
            <div className="composer-footer">
              <span id="brief-help" className="composer-hint">
                <Icon name="lock" size={13} /> Your draft stays in this company
              </span>
              <Button id="composer-submit" type="submit" variant="primary" disabled={!brief.trim()}>
                <Icon name="send" size={14} /> Create Golden Run
              </Button>
            </div>
            {submitted && family === 'ambiguous' && (
              <div style={{ marginTop: 16 }}>
                <div className="ui-state-notice ui-state-notice-amber" role="alert">
                  <Icon name="help" size={18} />
                  <div>
                    <strong>One detail would help</strong>
                    <p>
                      Tell us whether this should be a Golden Run or a camera-based rule before
                      creating it.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </form>
        </Card>
        <Card className="routing-card">
          <h3>Detected intent</h3>
          <button
            className={`routing-option ${family === 'golden_run' ? 'routing-option-selected' : ''}`}
            onClick={() => setFamily('golden_run')}
            aria-pressed={family === 'golden_run'}
          >
            <Icon name="book" size={17} />
            <span>
              <strong>Golden Run</strong>
              <p>Capture, review, publish, and guide a physical procedure.</p>
            </span>
          </button>
          <button
            className={`routing-option ${family === 'ambiguous' ? 'routing-option-selected' : ''}`}
            onClick={() => setFamily('ambiguous')}
            aria-pressed={family === 'ambiguous'}
          >
            <Icon name="camera" size={17} />
            <span>
              <strong>Needs clarification</strong>
              <p>Ask for the intended workflow family before creating.</p>
            </span>
          </button>
          <div className="routing-confidence">
            <span>Routing confidence · {family === 'golden_run' ? '94%' : 'Needs context'}</span>
            <span>
              <i style={{ width: family === 'golden_run' ? '94%' : '28%' }} />
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
