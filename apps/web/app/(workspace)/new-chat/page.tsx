'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Icon } from '@vision-codef/ui';
import { ApiClientError, getApiClient } from '../../../src/lib/api-client';
import { normalizeWorkflowBrief } from '../../../src/lib/new-chat-workflow';

export default function NewChatPage() {
  const router = useRouter();
  const [brief, setBrief] = useState(
    'Capture the expert way to fold a paper crane, then guide another person through the approved sequence.',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedBrief = normalizeWorkflowBrief(brief);
    setError(undefined);
    if (!normalizedBrief) return;

    setIsSubmitting(true);
    try {
      const api = getApiClient();
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
          <p className="eyebrow">New Golden Run</p>
          <h1>What should Vision Codef learn?</h1>
          <p className="lede">
            Describe the physical procedure you want to capture from an expert and later guide
            someone through.
          </p>
        </div>
        <Badge tone="blue">Contract v0.1</Badge>
      </div>
      <div className="composer-layout">
        <Card className="composer-card">
          <form onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="workflow-brief">Describe the procedure</label>
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
                {isSubmitting ? 'Creating workflow…' : 'Continue to capture setup'}
              </Button>
            </div>
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
          <p className="eyebrow">Workflow type</p>
          <div className="workflow-type-summary">
            <Icon name="book" size={17} />
            <span>
              <strong>Golden Run</strong> <Badge tone="green">Selected</Badge>
              <p>Learn a physical procedure from an expert demonstration.</p>
            </span>
          </div>
          <div className="workflow-next-steps">
            <strong>What happens next</strong>
            <ol>
              <li><span>1</span>Connect the phone</li>
              <li><span>2</span>Record the expert run</li>
              <li><span>3</span>Review the learned steps</li>
            </ol>
          </div>
          <div className="workflow-scope-note">
            <Icon name="camera" size={15} />
            <span>Camera alert rules will have a separate setup flow.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
