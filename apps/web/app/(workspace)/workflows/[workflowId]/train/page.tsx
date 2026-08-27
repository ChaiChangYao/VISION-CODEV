'use client';

import { ConnectedGoldenRun } from '../../../../components/connected-golden-run';
import { WorkflowHeader } from '../../../../components/workflow-navigation';

export default async function TrainPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <div><WorkflowHeader stage="train" /><ConnectedGoldenRun workflowId={workflowId} stage="train" /></div>;
}

