'use client';

import { ConnectedGoldenRun } from '../../../../components/connected-golden-run';
import { WorkflowHeader } from '../../../../components/workflow-navigation';
import { use } from 'react';

export default function TrainPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = use(params);
  return <div><WorkflowHeader workflowId={workflowId} stage="train" /><ConnectedGoldenRun workflowId={workflowId} stage="train" /></div>;
}

