import Link from 'next/link';
import { Badge, Button, Card, Icon } from '@vision-codef/ui';
import { workflow } from '../../../src/lib/demo-data';

export default function WorkspacePage() {
  return <div>
    <div className="page-heading"><div><p className="eyebrow">Workspace overview</p><h1>Good morning, Alex.</h1><p className="lede">Turn expert practice into clear, reviewable procedures your team can follow with confidence.</p></div><Link href="/new-chat"><Button variant="primary"><Icon name="sparkles" size={15} /> New Chat</Button></Link></div>
    <div className="stat-grid"><Card className="stat-card"><dl><dt>Active workflows</dt><dd>1</dd></dl><small>Golden Run in training</small></Card><Card className="stat-card"><dl><dt>Published procedures</dt><dd>0</dd></dl><small>Ready for review</small></Card><Card className="stat-card"><dl><dt>Connected devices</dt><dd>1</dd></dl><small>Phone session available</small></Card></div>
    <div className="section-title"><h2>Recent workflows</h2><Link href="/workflows">View all <Icon name="arrow-right" size={13} /></Link></div>
    <div className="workflow-list"><Link className="ui-card workflow-row" href={`/workflows/${workflow.id}/train`}><div className="workflow-main"><span className="workflow-icon"><Icon name="layers" size={18} /></span><div><strong>{workflow.title}</strong><small>Paper crane · Last opened {workflow.updatedAt.toLowerCase()}</small></div></div><span className="workflow-meta">Golden Run</span><Badge tone="amber">In training</Badge><Icon name="chevron-right" size={16} /></Link></div>
    <div className="section-title"><h2>Start with a connected session</h2></div>
    <Card><div className="ui-empty-state"><span className="ui-empty-icon"><Icon name="camera" size={22} /></span><h3>Capture an expert Golden Run</h3><p>Pair a phone, keep the capture session in the foreground, and let your team review the procedure before it can be deployed.</p><Link href="/new-chat"><Button variant="secondary">Create a Golden Run <Icon name="arrow-right" size={14} /></Button></Link></div></Card>
  </div>;
}
