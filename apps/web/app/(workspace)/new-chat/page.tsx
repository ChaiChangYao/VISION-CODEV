'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Icon } from '@vision-codef/ui';
import { ApiClientError, getApiClient } from '../../../src/lib/api-client';
import {
  clarificationDetails,
  isUnambiguousGoldenRun,
  normalizeWorkflowBrief,
} from '../../../src/lib/new-chat-workflow';

export default function NewChatPage() {
  const router = useRouter();
  const [brief, setBrief] = useState(
    'Capture the expert way to fold a paper crane, then guide another person through the approved sequence.',
  );
  const [submitted, setSubmitted] = useState(false);
  const [family, setFamily] = useState<'golden_run' | 'ambiguous'>('golden_run');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [clarification, setClarification] = useState<string>();
  const [confidence, setConfidence] = useState<number>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedBrief = normalizeWorkflowBrief(brief);
    setSubmitted(true);
    setError(undefined);
    setClarification(undefined);
    setConfidence(undefined);

    if (!normalizedBrief || family === 'ambiguous') {
      setClarification(clarificationDetails());
      return;
    }

    setIsSubmitting(true);
    try {
      const api = getApiClient();
      const intent = await api.routeIntent(normalizedBrief);
      setConfidence(intent.confidence);

      if (!isUnambiguousGoldenRun(intent)) {
        setFamily(intent.family === 'golden_run' ? 'golden_run' : 'ambiguous');
        setClarification(clarificationDetails(intent));
        return;
      }

      const workflow = await api.createWorkflow({ brief: normalizedBrief, family: 'golden_run' });
      router.push(`/workflows/${workflow.id}/train`);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The workflow could not be created. Check the API connection and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
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
                data-interaction-id="composer-text"
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
              <Button
                id="composer-submit"
                data-interaction-id="composer-submit"
                type="submit"
                variant="primary"
                disabled={!brief.trim() || isSubmitting}
              >
                <Icon name="send" size={14} />{' '}
                {isSubmitting ? 'Checking brief…' : 'Create Golden Run'}
              </Button>
            </div>
            {submitted && clarification && (
              <div style={{ marginTop: 16 }}>
                <div className="ui-state-notice ui-state-notice-amber" role="alert">
                  <Icon name="help" size={18} />
                  <div>
                    <strong>One detail would help</strong>
                    <p>{clarification}</p>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div style={{ marginTop: 16 }}>
                <div className="ui-state-notice ui-state-notice-red" role="alert">
                  <Icon name="info" size={18} />
                  <div>
                    <strong>Couldn’t create the workflow</strong>
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            )}
          </form>
        </Card>
        <Card className="routing-card">
          <h3>Detected intent</h3>
          <button
            id="intent-golden-run"
            data-interaction-id="intent-golden-run"
            className={`routing-option ${family === 'golden_run' ? 'routing-option-selected' : ''}`}
            onClick={() => {
              setFamily('golden_run');
              setClarification(undefined);
              setError(undefined);
            }}
            aria-pressed={family === 'golden_run'}
            type="button"
          >
            <Icon name="book" size={17} />
            <span>
              <strong>Golden Run</strong>
              <p>Capture, review, publish, and guide a physical procedure.</p>
            </span>
          </button>
          <button
            id="intent-needs-clarification"
            data-interaction-id="intent-needs-clarification"
            className={`routing-option ${family === 'ambiguous' ? 'routing-option-selected' : ''}`}
            onClick={() => {
              setFamily('ambiguous');
              setClarification(undefined);
              setError(undefined);
            }}
            aria-pressed={family === 'ambiguous'}
            type="button"
          >
            <Icon name="camera" size={17} />
            <span>
              <strong>Needs clarification</strong>
              <p>Ask for the intended workflow family before creating.</p>
            </span>
          </button>
          <div className="routing-confidence">
            <span>
              Routing confidence ·{' '}
              {confidence === undefined
                ? family === 'golden_run'
                  ? 'Not checked'
                  : 'Needs context'
                : `${Math.round(confidence * 100)}%`}
            </span>
            <span>
              <i
                style={{
                  width: `${Math.round(
                    (confidence ?? (family === 'golden_run' ? 0 : 0.28)) * 100,
                  )}%`,
                }}
              />
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
