'use client';

import { ConnectedGoldenRun } from '../../../../components/connected-golden-run';
import { WorkflowHeader } from '../../../../components/workflow-navigation';

export default async function ApprovePage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  return <div><WorkflowHeader stage="approve" /><ConnectedGoldenRun workflowId={workflowId} stage="approve" /></div>;
}

