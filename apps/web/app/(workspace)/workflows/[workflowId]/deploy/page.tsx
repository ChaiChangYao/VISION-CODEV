'use client';

import { ConnectedGoldenRun } from '../../../../components/connected-golden-run';
import { WorkflowHeader } from '../../../../components/workflow-navigation';

export default async function DeployPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <div><WorkflowHeader stage="deploy" /><ConnectedGoldenRun workflowId={workflowId} stage="deploy" /></div>;
}

