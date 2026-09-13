import { describe, expect, it, vi } from 'vitest';

import { claimTutorial, requestTutorialAccess, type TutorialApiConfig } from './tutorialApi';

const config: TutorialApiConfig = {
  pairingEndpoint: 'http://laptop:4000/v1/deployment-pairings/claim',
  tokenEndpoint: 'http://laptop:4000/v1/deployment-token',
  companyId: 'company',
  memberId: 'member',
  deviceId: 'phone',
};

describe('tutorial API', () => {
  it('claims a tutorial with tenant and stable-device boundaries', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ data: {
      deploymentId: 'deployment', workflowId: 'workflow', deviceId: 'phone', roomName: 'room',
    } }), { status: 200 }));
    await expect(claimTutorial({ ...config, request }, '123456')).resolves.toMatchObject({ deploymentId: 'deployment' });
    expect(request).toHaveBeenCalledWith(config.pairingEndpoint, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-company-id': 'company', 'x-member-id': 'member' }),
      body: JSON.stringify({ pairingCode: '123456', deviceId: 'phone' }),
    }));
  });

  it('rejects malformed codes before the network request', async () => {
    const request = vi.fn();
    await expect(claimTutorial({ ...config, request }, '123')).rejects.toThrow('six-digit');
    expect(request).not.toHaveBeenCalled();
  });

  it('requests a deployment-scoped publisher token', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ data: { token: 'jwt', currentInstruction: 'Inspect the approved part.' } }), { status: 200 }));
    const tutorial = { deploymentId: 'deployment', workflowId: 'workflow', deviceId: 'phone', roomName: 'room' };
    await expect(requestTutorialAccess({ ...config, request }, tutorial)).resolves.toEqual({ token: 'jwt', currentInstruction: 'Inspect the approved part.' });
    expect(request).toHaveBeenCalledWith(config.tokenEndpoint, expect.objectContaining({
      body: JSON.stringify({ deploymentId: 'deployment', workflowId: 'workflow', deviceId: 'phone', memberId: 'member' }),
    }));
  });
});
