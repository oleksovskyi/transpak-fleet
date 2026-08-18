import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: JSX.Element;
  disabled?: boolean;
  hint?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Дашборд',
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: '/fleet',
    label: 'Автопарк',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 3h13v13H1z" />
        <path d="M14 8h4l3 3v5h-7V8z" />
        <circle cx="6" cy="18.5" r="1.8" />
        <circle cx="17.5" cy="18.5" r="1.8" />
      </svg>
    ),
  },
  {
    to: '/maintenance',
    label: 'ТО і ремонт',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a4 4 0 01-5.4 5.4l-6 6 2 2 6-6a4 4 0 015.4-5.4l-2.7 2.7-2-2z" />
      </svg>
    ),
  },
  {
    to: '/drivers',
    label: 'Водії',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    ),
  },
  {
    to: '/routes',
    label: 'Маршрути',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="5" cy="6" r="2.3" />
        <circle cx="19" cy="18" r="2.3" />
        <path d="M6.8 7.6C10 11 13 9 15 12s0 3.4 2.2 4.4" />
      </svg>
    ),
  },
  {
    to: '/fuel',
    label: 'Паливо',
    disabled: true,
    hint: 'Розділ у розробці — з\'явиться найближчим часом',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 21V6a2 2 0 012-2h6a2 2 0 012 2v15" />
        <path d="M4 11h10" />
        <path d="M14 8h2l3 3v5.5a1.5 1.5 0 01-3 0V15h-2" />
      </svg>
    ),
  },
];

const SETTINGS_ITEM: NavItem = {
  to: '/settings',
  label: 'Налаштування',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.2a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.2a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.2a1.6 1.6 0 00-1.5 1z" />
    </svg>
  ),
};

export default function Layout() {
  const { user, logout } = useAuth();
  const items = user?.role === 'admin' ? [...NAV_ITEMS, SETTINGS_ITEM] : NAV_ITEMS;
  const initials = (user?.email ?? '??').slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TP</div>
          <div>
            <div className="brand-name">Transpak</div>
            <div className="brand-sub">Fleet control</div>
          </div>
        </div>
        <nav className="nav">
          {items.map((item) =>
            item.disabled ? (
              <span key={item.to} className="nav-item disabled" title={item.hint}>
                {item.icon}
                {item.label}
              </span>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="user-row">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.email}</div>
              <div className="user-role">{user?.role === 'admin' ? 'Адміністратор' : 'Переглядач'}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="global-bar">
          <button className="icon-btn" disabled title="Сповіщення підключимо окремим кроком">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
          </button>
          <button className="btn" onClick={logout}>
            Вийти
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
