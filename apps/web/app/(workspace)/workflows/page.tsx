import Link from 'next/link';
import { Badge, Button, Card, Icon } from '@vision-codef/ui';
import { workflow } from '../../../src/lib/demo-data';

export default function WorkflowsPage() {
  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Workflows</h1>
          <p className="lede">
            Every procedure moves through the same reviewable lifecycle: train, process, approve,
            then deploy.
          </p>
        </div>
        <Link href="/new-chat">
          <Button variant="primary">
            <Icon name="plus" size={15} /> New workflow
          </Button>
        </Link>
      </div>
      <Card>
        <div className="workflow-list">
          <Link className="workflow-row" href={`/workflows/${workflow.id}/train`}>
            <div className="workflow-main">
              <span className="workflow-icon">
                <Icon name="layers" size={18} />
              </span>
              <div>
                <strong>{workflow.title}</strong>
                <small>{workflow.description}</small>
              </div>
            </div>
            <span className="workflow-meta">Golden Run</span>
            <Badge tone="amber">In training</Badge>
            <Icon name="chevron-right" size={16} />
          </Link>
        </div>
      </Card>
    </div>
  );
}
