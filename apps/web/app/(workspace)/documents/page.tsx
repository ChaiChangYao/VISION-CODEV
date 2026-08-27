import { Card, EmptyState } from '@vision-codef/ui';

export default function DocumentsPage() {
  return <div><div className="page-heading"><div><p className="eyebrow">Resources</p><h1>Documents</h1><p className="lede">Ground approved procedures in source evidence and page-level references.</p></div></div><Card><EmptyState icon="file-text" title="No documents uploaded" description="Document ingestion and evidence highlighting arrive after the Golden Run integration gate. Nothing has been silently simulated here." /></Card></div>;
}
