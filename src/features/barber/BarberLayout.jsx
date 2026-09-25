import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import styles from './BarberLayout.module.css';

export default function BarberLayout() {
  const { name, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);

  function handleLogout() {
    setLogoutOpen(false);
    logout();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>FlowCut</span>

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