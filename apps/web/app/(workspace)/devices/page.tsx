import { Card, EmptyState } from '@vision-codef/ui';

export default function DevicesPage() {
  return <div><div className="page-heading"><div><p className="eyebrow">Resources</p><h1>Devices</h1><p className="lede">Connect the capture sources your team uses for Golden Runs.</p></div></div><Card><EmptyState icon="video" title="No device directory yet" description="The first Golden Run uses a paired phone. Device adapters and edge connectors are intentionally deferred until the physical capture gate passes." /></Card></div>;
}
