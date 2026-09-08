export type InteractionInventoryEntry = {
  id: string;
  route: string;
  label: string;
  kind: 'link' | 'button' | 'form' | 'tab' | 'input' | 'region';
  automated: boolean;
  notes?: string;
};

/** Machine-readable coverage map for actionable controls owned by the web workstream. */
export const interactionInventory: InteractionInventoryEntry[] = [
  { id: 'nav-new-chat', route: '/workspace', label: 'New Chat', kind: 'link', automated: true },
  { id: 'nav-workflows', route: '/workspace', label: 'Workflows', kind: 'link', automated: true },
  {
    id: 'nav-devices',
    route: '/workspace',
    label: 'Devices',
    kind: 'link',
    automated: true,
    notes: 'UI shell only; device backend is deferred.',
  },
  {
    id: 'nav-documents',
    route: '/workspace',
    label: 'Documents',
    kind: 'link',
    automated: true,
    notes: 'UI shell only; ingestion is deferred.',
  },
  { id: 'nav-account', route: '/account', label: 'Account menu', kind: 'button', automated: true },
  {
    id: 'composer-text',
    route: '/new-chat',
    label: 'Workflow brief',
    kind: 'input',
    automated: true,
  },
  {
    id: 'composer-submit',
    route: '/new-chat',
    label: 'Continue to capture setup',
    kind: 'form',
    automated: true,
  },
  {
    id: 'workflow-train-tab',
    route: '/workflows/:id/train',
    label: 'Train',
    kind: 'tab',
    automated: true,
  },
  {
    id: 'workflow-approve-tab',
    route: '/workflows/:id/approve',
    label: 'Approve',
    kind: 'tab',
    automated: true,
  },
  {
    id: 'workflow-deploy-tab',
    route: '/workflows/:id/deploy',
    label: 'Deploy',
    kind: 'tab',
    automated: true,
  },
  {
    id: 'train-start-session',
    route: '/workflows/:id/train',
    label: 'Start capture',
    kind: 'button',
    automated: true,
  },
  {
    id: 'train-stop-session',
    route: '/workflows/:id/train',
    label: 'Stop and process',
    kind: 'button',
    automated: true,
  },
  {
    id: 'train-retry',
    route: '/workflows/:id/train',
    label: 'Retry connection',
    kind: 'button',
    automated: true,
  },
  {
    id: 'approve-step-select',
    route: '/workflows/:id/approve',
    label: 'Select procedure step',
    kind: 'button',
    automated: true,
  },
  {
    id: 'connected-publish',
    route: '/workflows/:id/approve',
    label: 'Publish procedure',
    kind: 'button',
    automated: true,
  },
  {
    id: 'connected-deploy-start',
    route: '/workflows/:id/deploy',
    label: 'Start deployment',
    kind: 'button',
    automated: true,
  },
  {
    id: 'connected-deploy-recover',
    route: '/workflows/:id/deploy',
    label: 'Return to previous state',
    kind: 'button',
    automated: true,
  },
  {
    id: 'connected-deploy-why',
    route: '/workflows/:id/deploy',
    label: 'Why?',
    kind: 'region',
    automated: true,
  },
  {
    id: 'train-create-session',
    route: '/workflows/:id/train',
    label: 'Prepare capture',
    kind: 'button',
    automated: true,
  },
  {
    id: 'connected-wrong-fold-fixture',
    route: '/workflows/:id/deploy',
    label: 'Run wrong-fold fixture',
    kind: 'button',
    automated: true,
    notes: 'Controlled development fixture; never physical acceptance evidence.',
  },
  {
    id: 'approve-instruction',
    route: '/workflows/:id/approve',
    label: 'Procedure instruction editor',
    kind: 'input',
    automated: true,
  },
];

export default interactionInventory;
