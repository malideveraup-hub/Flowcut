import { Link } from 'react-router-dom';
import styles from './CustomerTopBar.module.css';

export default function CustomerTopBar({ unreadCount = 0 }) {
  return (
    <header className={styles.bar}>
      <Link to="/" className={styles.brand}>
        FLOWCUT
      </Link>
      <Link to="/notifications" className={styles.bell} aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2a6 6 0 0 0-6 6v3.2c0 .6-.2 1.2-.6 1.7L4 15.5c-.6.8 0 2 1 2h14c1 0 1.6-1.2 1-2l-1.4-2.6c-.4-.5-.6-1.1-.6-1.7V8a6 6 0 0 0-6-6Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M9.5 20a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        {unreadCount > 0 && <span className={styles.dot} aria-hidden="true" />}
      </Link>
    </header>
  );
}
