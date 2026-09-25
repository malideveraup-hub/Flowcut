import { Outlet } from 'react-router-dom';
import CustomerTopBar from '../../components/customer/CustomerTopBar';
import BottomTabBar from '../../components/customer/BottomTabBar';
import styles from './CustomerLayout.module.css';

export default function CustomerLayout() {
  return (
    <div className={styles.shell}>
      <CustomerTopBar unreadCount={2} />
      <main className={styles.main}>
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
