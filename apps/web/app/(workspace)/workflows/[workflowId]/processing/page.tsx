'use client';

import { use } from 'react';
import { ConnectedGoldenRun } from '../../../../components/connected-golden-run';
import { WorkflowHeader } from '../../../../components/workflow-navigation';

export default function ProcessingPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = use(params);
  return <div><WorkflowHeader workflowId={workflowId} stage="processing" /><ConnectedGoldenRun workflowId={workflowId} stage="processing" /></div>;
}
