import { Badge, Card, StateNotice } from '@vision-codef/ui';

export default function SettingsPage() {
  return <div><div className="page-heading"><div><p className="eyebrow">Workspace</p><h1>Settings</h1><p className="lede">Workspace-level preferences and integration readiness.</p></div></div><Card className="surface-card"><div className="surface-card-header"><h2>Workspace configuration</h2><Badge tone="neutral">Demo shell</Badge></div><div className="surface-card-body"><StateNotice icon="settings" title="No configuration changes are available yet">Settings will be connected to the company API after the shared web contract is extended. This surface does not mutate shared configuration.</StateNotice></div></Card></div>;
}
