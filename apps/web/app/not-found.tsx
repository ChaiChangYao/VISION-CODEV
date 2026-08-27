import Link from 'next/link';
import { Button, Icon } from '@vision-codef/ui';

export default function NotFound() {
  return (
    <main className="page-center">
      <div className="error-card">
        <span className="error-icon">
          <Icon name="search" size={24} />
        </span>
        <h1>Page not found</h1>
        <p>This workspace route doesn’t exist or is no longer available.</p>
        <Link href="/workspace">
          <Button variant="primary">Back to workspace</Button>
        </Link>
      </div>
    </main>
  );
}
