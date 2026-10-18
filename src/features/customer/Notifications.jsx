import { Link, useOutletContext } from 'react-router-dom';
import EmptyState from '../../components/ui/EmptyState';
import styles from './Notifications.module.css';

export default function Notifications() {
  const { notificationState } = useOutletContext();
  const { notifications, unreadCount, loading, markRead, markAllRead } = notificationState;

  if (loading && notifications.length === 0) {
    return <EmptyState skin="pixel" title="Loading notifications" body="Queue and shop updates will appear here." />;
  }

  if (notifications.length === 0) {
    return <EmptyState skin="pixel" title="No updates yet" body="Queue and shop updates will show up here." />;
  }

  return (
    <section>
      <div className={styles.heading}>
        <div>
          <p className={styles.sectionLabel}>Notifications</p>
          <p className={styles.subtitle}>{unreadCount ? `${unreadCount} unread updates` : 'You’re all caught up'}</p>
        </div>
        <button className={styles.markAll} type="button" disabled={!unreadCount} onClick={() => void markAllRead()}>
          Mark all as read
        </button>
      </div>
      <div className={styles.list}>
        {notifications.map((n) => (
          <Link
            className={`${styles.row} ${n.read ? '' : styles.unread}`}
            key={n.id}
            to="/my-queue"
            onClick={() => { if (!n.read) void markRead(n.id); }}
          >
            <span className={styles.rowDot} aria-hidden="true" />
            <span className={styles.rowCopy}>
              <strong>{n.title}</strong>
              <span>{n.message}</span>
              <time dateTime={n.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(n.createdAt))}</time>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
