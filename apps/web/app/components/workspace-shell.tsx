'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Avatar, Badge, Divider, Icon } from '@vision-codef/ui';

const primaryNav = [
  { href: '/workspace', label: 'Overview', icon: 'home' as const },
  { href: '/new-chat', label: 'New Chat', icon: 'sparkles' as const },
  { href: '/workflows', label: 'Workflows', icon: 'layers' as const },
];
const resourceNav = [
  { href: '/devices', label: 'Devices', icon: 'video' as const },
  { href: '/documents', label: 'Documents', icon: 'file-text' as const },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/workspace' ? pathname === href : pathname.startsWith(href);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside
        className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="brand-row">
          <Link className="brand" href="/workspace" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark">
              <Icon name="layers" size={18} />
            </span>
            <span>
              vision <b>codef</b>
            </span>
          </Link>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="company-switcher">
          <span className="company-avatar">N</span>
          <span>
            <b>Northstar Works</b>
            <small>Demo company</small>
          </span>
          <Icon className="muted-icon" name="chevron-down" size={15} />
        </div>
        <nav className="sidebar-nav">
          <span className="nav-label">Workspace</span>
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              className={`nav-link ${isActive(item.href) ? 'nav-link-active' : ''}`}
              href={item.href}
              onClick={() => setMobileOpen(false)}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {item.label === 'New Chat' && <span className="nav-kbd">⌘ K</span>}
            </Link>
          ))}
          <span className="nav-label nav-label-spaced">Resources</span>
          {resourceNav.map((item) => (
            <Link
              key={item.href}
              className={`nav-link ${isActive(item.href) ? 'nav-link-active' : ''}`}
              href={item.href}
              onClick={() => setMobileOpen(false)}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Divider />
          <Link className="nav-link" href="/help">
            <Icon name="help" size={17} />
            <span>Help center</span>
          </Link>
          <Link className="nav-link" href="/settings">
            <Icon name="settings" size={17} />
            <span>Settings</span>
          </Link>
          <button
            className="account-trigger"
            aria-expanded={accountOpen}
            aria-controls="account-menu"
            onClick={() => setAccountOpen((open) => !open)}
          >
            <Avatar initials="AR" size="sm" />
            <span>
              <b>Alex Rivera</b>
              <small>Operator</small>
            </span>
            <Icon className="muted-icon" name="chevron-down" size={15} />
          </button>
          {accountOpen && (
            <div id="account-menu" className="account-menu" role="menu">
              <Link href="/account" role="menuitem" onClick={() => setAccountOpen(false)}>
                <Icon name="user" size={15} /> Account
              </Link>
              <Link href="/settings" role="menuitem" onClick={() => setAccountOpen(false)}>
                <Icon name="settings" size={15} /> Settings
              </Link>
              <Divider />
              <button role="menuitem">
                <Icon name="lock" size={15} /> Sign out <Badge tone="neutral">Soon</Badge>
              </button>
            </div>
          )}
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="content-frame">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumbs">
            <span>Northstar Works</span>
            <Icon name="chevron-right" size={14} />
            <strong>
              {pathname.startsWith('/workflows')
                ? 'Golden Run'
                : pathname === '/new-chat'
                  ? 'New Chat'
                  : pathname === '/account'
                    ? 'Account'
                    : 'Overview'}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="connection-dot">
              <i /> Connected
            </span>
            <button className="icon-button" aria-label="Open help">
              <Icon name="help" size={18} />
            </button>
            <div className="top-avatar">
              <Avatar initials="AR" size="sm" />
            </div>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
