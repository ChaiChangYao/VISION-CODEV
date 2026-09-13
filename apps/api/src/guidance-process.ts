import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const processes = new Map<string, ChildProcess>();

export function startLocalGuidanceProcess(input: {
  deploymentId: string;
  workflowId: string;
  companyId: string;
  memberId: string;
}): 'started' | 'already_running' | 'externally_managed' {
  if (process.env.NODE_ENV === 'production' || process.env.VISION_CODEF_AUTO_START_GUIDANCE === 'false') return 'externally_managed';
  const existing = processes.get(input.deploymentId);
  if (existing && existing.exitCode === null && !existing.killed) return 'already_running';
  const entrypoint = resolve(process.cwd(), 'services/realtime-guidance/dist/main.js');
  if (!existsSync(entrypoint)) throw new Error('Realtime guidance is not built. Restart the Golden Run stack.');
  const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(), windowsHide: true,
    env: {
      ...process.env,
      VISION_CODEF_DEPLOYMENT_ID: input.deploymentId,
      VISION_CODEF_WORKFLOW_ID: input.workflowId,
      NEXT_PUBLIC_COMPANY_ID: input.companyId,
      NEXT_PUBLIC_MEMBER_ID: input.memberId,
      VISION_CODEF_CHANGE_DETECTOR: process.env.VISION_CODEF_CHANGE_DETECTOR || 'frame-difference',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.set(input.deploymentId, child);
  child.stdout?.on('data', (chunk) => console.log(`[guidance ${input.deploymentId.slice(0, 8)}] ${String(chunk).trim()}`));
  child.stderr?.on('data', (chunk) => console.error(`[guidance ${input.deploymentId.slice(0, 8)}] ${String(chunk).trim()}`));
  child.once('exit', () => processes.delete(input.deploymentId));
  return 'started';
}

export function stopLocalGuidanceProcesses(): void {
  for (const child of processes.values()) child.kill();
  processes.clear();
}
