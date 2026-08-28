import { describe, expect, it } from 'vitest';
import { signProcessingCompletion, verifyProcessingCompletionSignature } from './processing-webhook.js';

describe('processing completion webhook signature', () => {
  it('accepts only the exact HMAC signature for the raw request body', () => {
    const body = JSON.stringify({ captureSessionId: 'capture-1', status: 'completed' });
    const signature = signProcessingCompletion(body, 'test-secret');

    expect(verifyProcessingCompletionSignature(body, signature, 'test-secret')).toBe(true);
    expect(verifyProcessingCompletionSignature(`${body} `, signature, 'test-secret')).toBe(false);
    expect(verifyProcessingCompletionSignature(body, signature, 'wrong-secret')).toBe(false);
    expect(verifyProcessingCompletionSignature(body, undefined, 'test-secret')).toBe(false);
  });
});
