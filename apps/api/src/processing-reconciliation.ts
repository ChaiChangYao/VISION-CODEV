import type { ProcessingExecutionStatus } from './processing-client.js';

export function processingReconciliationMessage(status: ProcessingExecutionStatus | undefined): string | undefined {
  if (!status || status === 'RUNNING' || status === 'CONTINUED_AS_NEW') return undefined;
  if (status === 'COMPLETED') return 'Temporal completed, but the signed completion callback was not persisted. Retry the preserved recording.';
  return `Temporal processing ended with status ${status}. Retry the preserved recording.`;
}
