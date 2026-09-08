'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@vision-codef/ui';
import { getApiClient, type WorkflowSummary } from '../../src/lib/api-client';

const workspaceNav = [
  { href: '/new-chat', label: 'New reasoning task', icon: 'plus' as const, primary: true },
  { href: '/documents', label: 'Knowledge library', icon: 'book' as const },
  { href: '/workflows', label: 'Scheduled reviews', icon: 'clock' as const },
  { href: '/settings', label: 'Plugins', icon: 'link' as const },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const api = useMemo(() => getApiClient(), []);
  const activeWorkflowId = pathname.match(/\/workflows\/([^/]+)/)?.[1];
  const activeWorkflow = workflows.find((workflow) => workflow.id === activeWorkflowId);
  const inReasoning = pathname.startsWith('/workflows') || pathname === '/new-chat';

  useEffect(() => {
    void api.listWorkflows().then(setWorkflows).catch(() => setWorkflows([]));
  }, [api]);

  return (
    <div className="app-frame reasoning-app-frame">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className={`sidebar reasoning-sidebar ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
        <div className="reasoning-brand-row">
          <Link className="reasoning-brand" href="/workspace" onClick={() => setMobileOpen(false)}>
            <span className="buildables-mark" aria-hidden="true"><i /><i /><i /></span>
            <strong>buildables.</strong>
          </Link>
          <button className="icon-button sidebar-collapse" aria-label="Collapse navigation" onClick={() => setMobileOpen(false)}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>

        <button className="reasoning-company-switcher" type="button">
          <span className="company-avatar">B</span>
          <strong>Buildables HQ</strong>
          <Icon name="chevron-down" size={14} />
        </button>

        <div className="reasoning-mode-switch" aria-label="Workspace mode">
          <Link className={!inReasoning ? 'active' : ''} href="/workspace">Workflow</Link>
          <Link className={inReasoning ? 'active' : ''} href="/workflows">Reasoning</Link>
        </div>

        <nav className="reasoning-nav">
          <span className="reasoning-nav-label">Workspace</span>
          {workspaceNav.map((item) => (
            <Link
              key={item.label}
              className={`reasoning-nav-link${item.primary ? ' reasoning-nav-primary' : ''}${pathname === item.href ? ' active' : ''}`}
              href={item.href}
              onClick={() => setMobileOpen(false)}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {activeWorkflow && pathname.includes('/deploy') ? (
          <section className="reasoning-task-section">
            <div className="reasoning-section-heading"><span>Live apply</span><b>1</b></div>
            <Link className="reasoning-live-task" href={`/workflows/${activeWorkflow.id}/deploy`}>
              <i />
              <span><strong>{activeWorkflow.title}</strong><small>Applying now</small></span>
              <Icon name="more" size={14} />
            </Link>
          </section>
        ) : null}

        <section className="reasoning-task-section reasoning-task-list">
          <div className="reasoning-section-heading"><span>Reasoning tasks</span></div>
          {workflows.length ? workflows.map((workflow) => {
            const active = workflow.id === activeWorkflowId;
            const status = workflow.status === 'Published' ? 'Approved' : workflow.status === 'Needs Review' ? 'Review requested' : 'Review';
            return (
              <Link
                key={workflow.id}
                className={`reasoning-task-row${active ? ' active' : ''}`}
                href={`/workflows/${workflow.id}/approve`}
                onClick={() => setMobileOpen(false)}
              >
                <i />
                <span><strong>{workflow.title}</strong><small>{status}</small></span>
              </Link>
            );
          }) : <p className="reasoning-empty-tasks">No reasoning tasks yet.</p>}
        </section>

        <div className="reasoning-sidebar-footer">
          <Link href="/help"><Icon name="help" size={15} /> Help</Link>
          <Link href="/settings"><Icon name="settings" size={15} /> Settings</Link>
        </div>
      </aside>

      {mobileOpen ? <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}

      <div className="content-frame reasoning-content-frame">
        <header className="reasoning-mobilebar">
          <button className="icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" /></button>
          <span className="buildables-mark" aria-hidden="true"><i /><i /><i /></span>
          <strong>{activeWorkflow?.title ?? 'Buildables Reasoning'}</strong>
        </header>
        <main id="main-content" className="main-content reasoning-main-content">{children}</main>
      </div>
    </div>
  );
}
