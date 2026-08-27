import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SVGProps } from 'react';

export type IconName =
  | 'activity'
  | 'arrow-right'
  | 'book'
  | 'camera'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'clipboard'
  | 'clock'
  | 'cloud-off'
  | 'file-text'
  | 'help'
  | 'home'
  | 'info'
  | 'layers'
  | 'link'
  | 'lock'
  | 'menu'
  | 'mic'
  | 'more'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'send'
  | 'settings'
  | 'shield'
  | 'sparkles'
  | 'stop'
  | 'upload'
  | 'user'
  | 'video'
  | 'x';

const paths: Record<IconName, ReactNode> = {
  activity: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16" /><path d="M8 7h8M8 11h8" /></>,
  camera: <><path d="M4 7h4l1.5-2h5L16 7h4v12H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M8 10h8M8 14h5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  'cloud-off': <><path d="m3 3 18 18M7 17h10a4 4 0 0 0 1.8-7.6A6 6 0 0 0 8.2 7.2" /><path d="M5.2 9.7A4 4 0 0 0 7 17" /></>,
  'file-text': <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 12h6M9 16h6" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 4.4 1.3c-.8 1-2.1 1.2-2.1 2.7M12 16h.01" /></>,
  home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 21v-6h6v6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  layers: <><path d="m12 3 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.3l1.2-1.2a5 5 0 0 0-7.1-7.1l-.7.7" /><path d="M14 11a5 5 0 0 0-7.5-.3l-1.2 1.2a5 5 0 0 0 7.1 7.1l.7-.7" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  play: <path d="m8 5 11 7-11 7z" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.7-3L3 11" /><path d="M3 5v6h6M4 13a8 8 0 0 0 14.7 3L21 13" /><path d="M21 19v-6h-6" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  send: <><path d="m3 4 18 8-18 8 3-8z" /><path d="M6 12h15" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.6h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h2.6v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v2.6h-.1a1.7 1.7 0 0 0-1.6 1z" /></>,
  shield: <><path d="M12 3 20 6v6c0 5-3.4 8.1-8 9-4.6-.9-8-4-8-9V6z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>,
  sparkles: <><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
  upload: <><path d="M12 16V4M8 8l4-4 4 4" /><path d="M5 15v4h14v-4" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  return <button className={`ui-button ui-button-${variant} ui-button-${size} ${className}`} {...props} />;
}

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue'; children: ReactNode; className?: string }) {
  return <span className={`ui-badge ui-badge-${tone} ${className}`}>{children}</span>;
}

export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={`ui-card ${className}`} {...props}>{children}</section>;
}

export function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`ui-avatar ui-avatar-${size}`} aria-hidden="true">{initials}</span>;
}

export function Divider() {
  return <div className="ui-divider" role="presentation" />;
}

export function EmptyState({ icon = 'layers', title, description, action }: { icon?: IconName; title: string; description: string; action?: ReactNode }) {
  return <div className="ui-empty-state"><span className="ui-empty-icon"><Icon name={icon} size={22} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function StateNotice({ tone = 'neutral', icon = 'info', title, children, action }: { tone?: 'neutral' | 'amber' | 'red' | 'green'; icon?: IconName; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className={`ui-state-notice ui-state-notice-${tone}`} role={tone === 'red' ? 'alert' : 'status'}><Icon name={icon} size={19} /><div><strong>{title}</strong><p>{children}</p>{action}</div></div>;
}
