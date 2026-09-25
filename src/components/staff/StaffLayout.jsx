import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import styles from './StaffLayout.module.css';

export default function StaffLayout({ navItems, subtitle }) {
  const { name, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);

  function handleLogout() {
    setLogoutOpen(false);
    logout();
  }

  return (
    <div className={styles.shell}>
      <Sidebar items={navItems} subtitle={subtitle} />

      <div className={styles.body}>
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

        <main className={styles.main}>
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