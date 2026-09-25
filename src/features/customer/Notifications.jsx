import { useEffect } from 'react';
import { useStore } from '../../hooks/useStore';
import { getNotifications, markAllNotificationsRead } from '../../api/queueApi';
import EmptyState from '../../components/ui/EmptyState';
import styles from './Notifications.module.css';

export default function Notifications() {
  const notifications = useStore(getNotifications);

  useEffect(() => {
    markAllNotificationsRead();
  }, []);

  if (notifications.length === 0) {
    return <EmptyState skin="pixel" title="No updates yet" body="Queue and shop updates will show up here." />;
  }

  return (
    <div>
      <p className={styles.sectionLabel}>Notifications</p>
      <div className={styles.list}>
        {notifications.map((n) => (
          <div className={styles.row} key={n.id}>
            {n.text}
          </div>
        ))}
      </div>
    </div>
  );
}
