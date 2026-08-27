'use client';

import { useEffect } from 'react';
import { Button, Icon } from '@vision-codef/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="page-center">
      <div className="error-card">
        <span className="error-icon">
          <Icon name="cloud-off" size={24} />
        </span>
        <h1>We couldn’t load this workspace</h1>
        <p>The interface is safe to retry. Any saved company data remains unchanged.</p>
        <Button variant="primary" onClick={reset}>
          <Icon name="refresh" size={16} /> Try again
        </Button>
      </div>
    </main>
  );
}
