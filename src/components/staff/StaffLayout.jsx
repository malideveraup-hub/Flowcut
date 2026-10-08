import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import styles from './StaffLayout.module.css';

export default function StaffLayout({ navItems, subtitle, superAdmin = false, roleLabel = superAdmin ? 'SUPER ADMIN' : undefined }) {
  const { pathname } = useLocation();
  const { name, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  function handleLogout() {
    setLogoutOpen(false);
    logout();
  }

  return (
    <div className={[styles.shell, superAdmin ? styles.superAdmin : ''].join(' ')}>
      {superAdmin && (
        <header className={styles.mobilebar}>
          <span className={styles.mobileLogo}><b>F</b>FlowCut</span>
          <button
            className={styles.menuButton}
            type="button"
            aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={navOpen}
            aria-controls="super-admin-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={navOpen ? 'm6 6 12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
          </button>
        </header>
      )}
      {superAdmin && navOpen && (
        <button className={styles.mobileOverlay} type="button" aria-label="Close navigation menu" onClick={() => setNavOpen(false)} />
      )}
      <Sidebar
        items={navItems}
        subtitle={subtitle}
        superAdmin={superAdmin}
        name={name}
        isOpen={navOpen}
        onNavigate={() => setNavOpen(false)}
        onLogout={() => setLogoutOpen(true)}
        roleLabel={roleLabel}
      />

      <div className={[styles.body, pathname === '/admin' ? styles.bodyDashboard : '', pathname === '/admin/queue' ? styles.bodyQueue : ''].join(' ')}>
        {!superAdmin && (
          <header className={styles.topbar}>
            <span />

            <div className={styles.who}>
              <span>{name}</span>

              <button
                className={styles.logout}
                onClick={() => setLogoutOpen(true)}
              >
                Log out
              </button>
            </div>
          </header>
        )}

        <main className={[styles.main, superAdmin ? styles.mainSuperAdmin : '', pathname === '/admin' ? styles.mainDashboard : '', pathname === '/admin/queue' ? styles.mainQueue : ''].join(' ')}>
          <Outlet />
        </main>
      </div>

      {/* LOG OUT MODAL */}
      <Modal
        skin="pixel"
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Log out?"
      >
        <p style={{ marginBottom: 12 }}>
          Are you sure you want to log out?
        </p>

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 12,
          }}
        >
          <Button
            skin="pixel"
            variant="secondary"
            onClick={() => setLogoutOpen(false)}
          >
            Cancel
          </Button>

          <Button
            skin="pixel"
            variant="destructive"
            onClick={handleLogout}
          >
            Log out
          </Button>
        </div>
      </Modal>
    </div>
  );
}