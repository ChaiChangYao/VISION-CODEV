export const PROCESSING_TASK_QUEUE = 'vision-codef-processing';
export type DurableJob = 'capture.finalize' | 'transcription' | 'procedure.induction' | 'document.ingestion' | 'evaluation' | 'publication';
export type JobRequest = { job: DurableJob; companyId: string; resourceId: string; idempotencyKey: string };
export function processingWorkflowId(companyId: string, captureSessionId: string): string { if (!companyId || !captureSessionId) throw new Error('companyId and captureSessionId are required'); return 'company:' + companyId + ':capture:' + captureSessionId; }
export function validateJobRequest(request: JobRequest): JobRequest { if (!request.companyId || !request.resourceId || !request.idempotencyKey) throw new Error('companyId, resourceId, and idempotencyKey are required'); return request; }
console.log('Vision Codef worker ready for durable processing orchestration.');

