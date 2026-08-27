import Link from 'next/link';
import { Badge, Icon } from '@vision-codef/ui';
import { workflow, type LifecycleStage } from '../../src/lib/demo-data';

const stages: Array<{ id: LifecycleStage; label: string; href: string }> = [
  { id: 'train', label: 'Train', href: `/workflows/${workflow.id}/train` },
  { id: 'processing', label: 'Processing', href: `/workflows/${workflow.id}/train` },
  { id: 'approve', label: 'Approve', href: `/workflows/${workflow.id}/approve` },
  { id: 'deploy', label: 'Deploy', href: `/workflows/${workflow.id}/deploy` },
];

export function WorkflowHeader({ stage }: { stage: LifecycleStage }) {
  return (
    <>
      <div className="workflow-header">
        <div>
          <p className="eyebrow">Golden Run · Workflow</p>
          <h1>{workflow.title}</h1>
          <div className="workflow-subline">
            <Badge tone="green">Draft capture</Badge>
            <span>Created {workflow.createdAt}</span>
            <span>·</span>
            <span>Updated {workflow.updatedAt}</span>
          </div>
        </div>
        <div className="workflow-actions">
          <Link href="/workflows">
            <button className="ui-button ui-button-secondary ui-button-sm">
              <Icon name="arrow-right" size={14} /> All workflows
            </button>
          </Link>
        </div>
      </div>
      <nav className="lifecycle-tabs" aria-label="Workflow lifecycle">
        {stages.map((item) => (
          <Link
            key={item.id}
            id={`workflow-${item.id}-tab`}
            className={`lifecycle-tab ${stage === item.id ? 'lifecycle-tab-active' : ''} ${['approve', 'deploy'].indexOf(item.id) < ['approve', 'deploy'].indexOf(stage) ? 'lifecycle-tab-done' : ''}`}
            aria-current={stage === item.id ? 'page' : undefined}
            href={item.href}
          >
            <span className="lifecycle-tab-number">
              {item.id === 'train' ? (
                <Icon name="video" size={14} />
              ) : item.id === 'processing' ? (
                <Icon name="activity" size={14} />
              ) : item.id === 'approve' ? (
                <Icon name="check" size={14} />
              ) : (
                <Icon name="play" size={13} />
              )}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
