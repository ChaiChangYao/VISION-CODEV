import { Card, EmptyState } from '@vision-codef/ui';

export default function HelpPage() {
  return <div><div className="page-heading"><div><p className="eyebrow">Support</p><h1>Help center</h1><p className="lede">A small set of clear next steps for the connected Golden Run demonstrator.</p></div></div><Card><EmptyState icon="help" title="Guidance is coming together" description="Start with New Chat to create a Golden Run. For media issues, confirm the phone app is foregrounded, awake, and connected to the same session." /></Card></div>;
}
