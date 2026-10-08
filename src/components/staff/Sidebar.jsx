import { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

function NavIcon({ label }) {
  const icons = {
    Dashboard: <><rect x="3" y="3" width="7" height="8" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /></>,
    Shops: <><path d="M3 9 4.5 4h15L21 9" /><path d="M4 9h16v11H4zM9 20v-6h6v6" /></>,
    Approvals: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    Users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-4 3-6 7-6s7 2 7 6M16 5a3.5 3.5 0 0 1 0 6.8M18 14c2.5.6 4 2.5 4 6" /></>,
    Analytics: <><path d="M3 20V11m6 9V5m6 15v-7m6 7H1" /></>,
    Settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" /></>,
    Queue: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
    Barbers: <><circle cx="12" cy="7" r="4" /><path d="M4 21c0-5 3-8 8-8s8 3 8 8" /></>,
    Services: <><path d="M4 5h16v14H4zM8 9h8M8 13h5" /></>,
    'QR code': <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14v2m-2 3h4v2" /></>,
    'QR Code': <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14v2m-2 3h4v2" /></>,
    'QR Code Management': <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14v2m-2 3h4v2" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[label] || icons.Dashboard}</svg>;
}

/**
 * items: [{ to, label, end? }]
 */
export default function Sidebar({ items, subtitle, superAdmin = false, name, isOpen = false, onNavigate, onLogout, roleLabel = superAdmin ? 'SUPER ADMIN' : '' }) {
  const isCustomRole = Boolean(roleLabel && roleLabel !== 'SUPER ADMIN');

  return (
    <aside
      id={superAdmin ? 'super-admin-sidebar' : undefined}
      className={[styles.sidebar, superAdmin ? styles.superAdmin : '', isOpen ? styles.open : ''].join(' ')}
    >
      <div className={styles.logo}>
        {superAdmin && <span className={styles.logoMark}>F</span>}
        FlowCut
      </div>
      {superAdmin && <div className={styles.role}>{roleLabel || 'SUPER ADMIN'}</div>}
      {subtitle && !superAdmin && <div className={styles.subtitle}>{subtitle}</div>}
      {subtitle && superAdmin && isCustomRole && <div className={styles.subtitle}>{subtitle}</div>}
      <nav className={superAdmin ? styles.nav : ''}>
        {items.map((item) => (
          <Fragment key={item.to}>
            {item.section && <div className={styles.navLabel}>{item.section}</div>}
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => [styles.item, isActive ? styles.active : ''].join(' ')}
              onClick={onNavigate}
            >
              {superAdmin && <NavIcon label={item.label} />}
              <span>{item.label}</span>
            </NavLink>
          </Fragment>
        ))}
      </nav>
      {superAdmin && (
        <div className={styles.account}>
          <div className={styles.accountText}><strong>{name || 'Shop Admin'}</strong><span>{roleLabel === 'SHOP ADMIN' ? 'Shop admin' : 'Super admin'}</span></div>
          <button type="button" className={styles.logout} onClick={onLogout}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M16 17l5-5-5-5m5 5H9" /></svg>
            Log out
          </button>
        </div>
      )}
    </aside>
  );
}
