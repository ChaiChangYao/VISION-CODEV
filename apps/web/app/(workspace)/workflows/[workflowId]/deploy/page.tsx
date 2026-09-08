'use client';

import { ConnectedGoldenRun } from '../../../../components/connected-golden-run';
import { WorkflowHeader } from '../../../../components/workflow-navigation';
import { use } from 'react';

export default function DeployPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = use(params);
  return <div><WorkflowHeader workflowId={workflowId} stage="deploy" /><ConnectedGoldenRun workflowId={workflowId} stage="deploy" /></div>;
}

