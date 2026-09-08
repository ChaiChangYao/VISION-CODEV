'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@vision-codef/ui';
import { type LifecycleStage } from '../../src/lib/demo-data';
import { getApiClient, type WorkflowSummary } from '../../src/lib/api-client';

export function WorkflowHeader({ workflowId, stage }: { workflowId: string; stage: LifecycleStage }) {
  const [workflow, setWorkflow] = useState<WorkflowSummary>();
  const api = useMemo(() => getApiClient(), []);
  const visibleStage = stage === 'processing' ? 'approve' : stage;
  const modes = [
    { id: 'train', label: 'Train', meta: stage === 'train' ? 'record' : 'done', href: `/workflows/${workflowId}/train` },
    { id: 'approve', label: 'Edit', meta: workflow?.status === 'Published' ? 'approved' : 'draft', href: `/workflows/${workflowId}/approve` },
    { id: 'deploy', label: 'Apply', meta: stage === 'deploy' ? 'live' : '', href: `/workflows/${workflowId}/deploy` },
  ] as const;

  useEffect(() => {
    void api.getWorkflow(workflowId).then(setWorkflow).catch(() => undefined);
  }, [api, workflowId]);

  const statusLabel = visibleStage === 'train' ? 'Raw evidence preserved' : visibleStage === 'approve' ? 'Senior approval required' : 'Approved knowledge';

  return (
    <header className="reasoning-workflow-header">
      <div className="reasoning-titlebar">
        <div className="reasoning-title-copy">
          <h1>{workflow?.title ?? 'Golden Run workflow'}</h1>
        </div>
        <div className="reasoning-title-actions">
          <button type="button" className="reasoning-search"><Icon name="search" size={15} /><span>Search moments</span><kbd>⌘ K</kbd></button>
          <span className={`reasoning-session-pill${visibleStage === 'deploy' ? ' live' : ''}`}><i />{visibleStage === 'deploy' ? 'Live' : visibleStage === 'train' ? 'Recording ready' : workflow?.status ?? 'Draft'}</span>
          <button type="button" className="icon-button reasoning-more" aria-label="More workflow actions"><Icon name="more" size={17} /></button>
        </div>
      </div>
      <div className="reasoning-modebar">
        <nav aria-label="Reasoning mode">
          {modes.map((mode) => (
            <Link key={mode.id} className={visibleStage === mode.id ? 'active' : ''} aria-current={visibleStage === mode.id ? 'page' : undefined} href={mode.href}>
              {mode.label}{mode.meta ? <small>{mode.meta}</small> : null}{mode.id === 'deploy' && visibleStage === 'deploy' ? <i /> : null}
            </Link>
          ))}
        </nav>
        <div className="reasoning-governance"><Icon name="shield" size={13} />{statusLabel}{stage === 'processing' ? <Link href={`/workflows/${workflowId}/processing`}>View processing</Link> : null}</div>
      </div>
    </header>
  );
}
