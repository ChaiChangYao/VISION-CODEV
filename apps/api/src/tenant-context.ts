import type { IncomingHttpHeaders } from 'node:http';
import { TenantContextSchema, type TenantContext } from '@vision-codef/contracts';

export type TenantContextErrorCode = 'UNAUTHENTICATED' | 'VALIDATION_FAILED';

/** A request did not carry a usable company/member tenant context. */
export class TenantContextError extends Error {
  constructor(
    readonly status: 400 | 401,
    readonly code: TenantContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TenantContextError';
  }
}

function singleHeader(headers: IncomingHttpHeaders, name: 'x-company-id' | 'x-member-id'): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    throw new TenantContextError(400, 'VALIDATION_FAILED', `${name} must be supplied exactly once.`);
  }

  return typeof value === 'string' ? value.trim() : undefined;
}

/**
 * Parse the authenticated tenant boundary used by API v1 requests.
 * Node normalizes incoming header names to lowercase; callers should pass
 * request.headers directly so duplicate values remain detectable.
 */
export function parseTenantContext(headers: IncomingHttpHeaders): TenantContext {
  const companyId = singleHeader(headers, 'x-company-id');
  const memberId = singleHeader(headers, 'x-member-id');

  if (!companyId || !memberId) {
    throw new TenantContextError(
      401,
      'UNAUTHENTICATED',
      'x-company-id and x-member-id headers are required for /v1 routes.',
    );
  }

  const result = TenantContextSchema.safeParse({ companyId, memberId });
  if (!result.success) {
    throw new TenantContextError(
      400,
      'VALIDATION_FAILED',
      'x-company-id and x-member-id must be valid UUIDs.',
    );
  }

  return result.data;
}
