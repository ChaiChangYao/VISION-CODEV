'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Icon, StateNotice } from '@vision-codef/ui';
import { demoSteps, provenanceLabels } from '../../../../../src/lib/demo-data';
import { WorkflowHeader } from '../../../../components/workflow-navigation';

export default function ApprovePage() {
  const [selected, setSelected] = useState(0);
  const [title, setTitle] = useState(demoSteps[0]?.title ?? 'Procedure step');
  const [instruction, setInstruction] = useState(demoSteps[0]?.instruction ?? '');
  const [published, setPublished] = useState(false);

  function chooseStep(index: number) {
    const step = demoSteps[index];
    if (!step) return;
    setSelected(index);
    setTitle(step.title);
    setInstruction(step.instruction);
  }

  return (
    <div>
      <WorkflowHeader stage="approve" />
      {published && (
        <div style={{ marginBottom: 16 }}>
          <StateNotice tone="green" icon="shield" title="Procedure published as version 1">
            This reviewable version is now the only procedure eligible for deployment.
          </StateNotice>
        </div>
      )}
      <div className="approve-layout">
        <Card className="step-list">
          <div className="step-list-header">
            <h2>
              Procedure steps <Badge tone="neutral">{demoSteps.length}</Badge>
            </h2>
          </div>
          {demoSteps.map((step, index) => (
            <button
              id={index === selected ? 'approve-step-select' : undefined}
              className={`step-row ${index === selected ? 'step-row-active' : ''}`}
              key={step.id}
              onClick={() => chooseStep(index)}
              aria-current={index === selected ? 'step' : undefined}
            >
              <span className="step-number">{index + 1}</span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.provenance.map((item) => provenanceLabels[item]).join(' · ')}</small>
              </span>
            </button>
          ))}
        </Card>
        <Card className="editor-card">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">Reviewer editor</p>
              <h2>Make the instruction unambiguous</h2>
              <p>AI-drafted content stays editable until an authorized reviewer publishes it.</p>
            </div>
            <Badge tone={published ? 'green' : 'amber'}>
              {published ? 'Published v1' : 'Draft · needs review'}
            </Badge>
          </div>
          <div className="form-field">
            <label htmlFor="step-title">Step title</label>
            <input
              id="step-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="step-instruction">Instruction</label>
            <textarea
              id="step-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </div>
          <div className="provenance-row">
            <span>Provenance</span>
            {(demoSteps[selected]?.provenance ?? []).map((item) => (
              <Badge
                key={item}
                tone={
                  item === 'MODEL_INFERENCE'
                    ? 'blue'
                    : item === 'PUBLISHED_REQUIREMENT'
                      ? 'green'
                      : 'neutral'
                }
              >
                {provenanceLabels[item]}
              </Badge>
            ))}
          </div>
          <div className="editor-footer">
            <small>
              <Icon name="shield" size={13} /> Publishing creates an immutable procedure version.
            </small>
            <div>
              <Button variant="secondary" onClick={() => chooseStep(selected)}>
                Reset draft
              </Button>
              {published ? (
                <Link href="/workflows/0198d9f2-2d2a-7cc1-ae15-bd6f4d8a1b03/deploy">
                  <Button variant="primary">
                    Open deployment <Icon name="arrow-right" size={14} />
                  </Button>
                </Link>
              ) : (
                <Button
                  id="approve-publish"
                  variant="primary"
                  onClick={() => setPublished(true)}
                  disabled={!title.trim() || !instruction.trim()}
                >
                  <Icon name="check" size={14} /> Publish procedure
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
