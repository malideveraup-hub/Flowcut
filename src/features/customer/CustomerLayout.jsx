import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import CustomerTopBar from '../../components/customer/CustomerTopBar';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import styles from './CustomerLayout.module.css';

export default function CustomerLayout() {
  const location = useLocation();
  const { role, loading: authLoading } = useAuth();
  const showNotifications = !authLoading && role === 'customer';
  const notificationState = useNotifications(showNotifications);

  return (
    <div className={styles.shell}>
      <CustomerTopBar notificationState={notificationState} showNotifications={showNotifications} />
      <main className={[
        styles.main,
        location.pathname === '/' ? styles.landingMain : '',
        location.pathname === '/discover' ? styles.discoveryMain : '',
        location.pathname === '/profile' ? styles.profileMain : '',
        location.pathname.startsWith('/shops/') && location.pathname.endsWith('/join') ? styles.joinMain : '',
      ].filter(Boolean).join(' ')}>
        <Outlet context={{ notificationState }} />
      </main>
    </div>
  );
}
