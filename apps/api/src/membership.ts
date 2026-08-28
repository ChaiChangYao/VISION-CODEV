import { TenantContextSchema, type TenantContext } from '@vision-codef/contracts';

const DEMO_COMPANY_ID = '00000000-0000-7000-8000-000000000001';
const DEMO_MEMBER_ID = '00000000-0000-4000-8000-000000000002';

export type MembershipDirectory = {
  has(tenant: TenantContext): boolean;
};

function key(tenant: TenantContext): string {
  return tenant.companyId + ':' + tenant.memberId;
}

/**
 * Development identity membership boundary. Production deployments must provide
 * an allow-list populated by the authenticated identity gateway or replace this
 * directory with a database-backed membership lookup.
 */
export function createMembershipDirectory(env: NodeJS.ProcessEnv = process.env): MembershipDirectory {
  const configured = (env.VISION_CODEF_ALLOWED_MEMBERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [companyId, memberId] = entry.split('/');
      return TenantContextSchema.safeParse({ companyId, memberId }).success ? companyId + ':' + memberId : undefined;
    })
    .filter((value): value is string => Boolean(value));
  const allowed = new Set(configured);
  if (allowed.size === 0 && env.NODE_ENV !== 'production') allowed.add(DEMO_COMPANY_ID + ':' + DEMO_MEMBER_ID);
  return { has(tenant) { return allowed.has(key(TenantContextSchema.parse(tenant))); } };
}
