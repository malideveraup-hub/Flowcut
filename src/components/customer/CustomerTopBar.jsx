import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import styles from './CustomerTopBar.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/discover', label: 'Discover' },
  { to: '/my-queue', label: 'My Queue' },
  { to: '/profile', label: 'Profile' },
];

function notificationTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function CustomerTopBar({ notificationState, showNotifications = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef(null);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    browserAlertPermission,
    browserAlertSoundEnabled,
    browserAlertBusy,
    browserAlertError,
    enableBrowserAlerts,
  } = notificationState;

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!notificationRef.current?.contains(event.target)) setNotificationsOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setNotificationsOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  function toggleNotifications() {
    setNotificationsOpen((open) => !open);
    setMenuOpen(false);
    void refresh().catch(() => {});
  }

  async function openNotification(notification) {
    if (!notification.read) {
      try {
        await markRead(notification.id);
      } catch {
        // Keep the dropdown usable while the notification API is unavailable.
      }
    }
    setNotificationsOpen(false);
    navigate('/my-queue');
  }

  async function readAllNotifications() {
    try {
      await markAllRead();
    } catch {
      // A later poll will refresh the unread count if this request fails.
    }
  }

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo} onClick={() => setMenuOpen(false)}>
          <span className={styles.logoMark} aria-hidden="true" />
          FLOWCUT
        </Link>
        <nav className={styles.links} aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.actions}>
          <Link to="/discover" className={styles.joinLink} onClick={() => setMenuOpen(false)}>Join a queue</Link>
          {showNotifications && <div className={styles.notificationWrap} ref={notificationRef}>
            <button
              type="button"
              className={styles.notificationButton}
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              aria-expanded={notificationsOpen}
              aria-controls="customer-notifications"
              onClick={toggleNotifications}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {notificationsOpen && (
              <section className={styles.notificationPopover} id="customer-notifications" aria-label="Recent notifications">
                <header className={styles.notificationHeader}>
                  <div>
                    <h2>Notifications</h2>
                    <span>{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.markAllButton}
                    onClick={readAllNotifications}
                    disabled={unreadCount === 0}
                  >
                    Mark all as read
                  </button>
                </header>
                <div className={styles.browserAlertSettings}>
                  {browserAlertPermission === 'granted' && browserAlertSoundEnabled && !browserAlertError ? (
                    <p className={styles.browserAlertStatus}>Browser alerts and sound are enabled for 10- and 5-minute reminders.</p>
                  ) : (
                    <>
                      {browserAlertPermission === 'denied' ? (
                        <p className={styles.browserAlertStatus}>Allow notifications for FlowCut in Chrome site settings. Page sound works while FlowCut is open.</p>
                      ) : browserAlertPermission === 'unsupported' ? (
                        <p className={styles.browserAlertStatus}>System notifications are unavailable here. Page sound works while FlowCut is open.</p>
                      ) : browserAlertPermission === 'granted' ? (
                        <p className={styles.browserAlertStatus}>
                          {browserAlertError
                            ? 'Chrome alerts could not be prepared. Page sound works while FlowCut is open.'
                            : 'Browser notifications are allowed. Enable page sound for 10- and 5-minute reminders.'}
                        </p>
                      ) : (
                        <p className={styles.browserAlertStatus}>Get a sound and browser alert when your turn is about 10 or 5 minutes away.</p>
                      )}
                      <button
                        type="button"
                        className={styles.enableBrowserAlertsButton}
                        onClick={() => void enableBrowserAlerts()}
                        disabled={browserAlertBusy}
                      >
                        {browserAlertBusy
                          ? 'Enabling alerts…'
                          : browserAlertPermission === 'denied' || browserAlertPermission === 'unsupported'
                            ? 'Enable page sound'
                            : browserAlertError
                              ? 'Retry browser alerts'
                              : 'Enable browser alerts and sound'}
                      </button>
                    </>
                  )}
                  {browserAlertPermission === 'granted' && browserAlertError && (
                    <p className={styles.browserAlertError}>{browserAlertError}</p>
                  )}
                </div>
                {loading && notifications.length === 0 ? (
                  <p className={styles.notificationEmpty}>Loading updates…</p>
                ) : notifications.length === 0 ? (
                  <p className={styles.notificationEmpty}>Queue and shop updates will appear here.</p>
                ) : (
                  <div className={styles.notificationList}>
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        className={`${styles.notificationItem} ${notification.read ? '' : styles.unread}`}
                        onClick={() => void openNotification(notification)}
                      >
                        <span className={styles.notificationDot} aria-hidden="true" />
                        <span className={styles.notificationCopy}>
                          <strong>{notification.title}</strong>
                          <span>{notification.message}</span>
                          <time dateTime={notification.createdAt}>{notificationTime(notification.createdAt)}</time>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <Link
                  to="/notifications"
                  className={styles.allNotificationsLink}
                  onClick={() => setNotificationsOpen(false)}
                >
                  View all notifications
                </Link>
              </section>
            )}
          </div>}
          <button
            className={styles.menuButton}
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="customer-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        {menuOpen && (
          <nav className={styles.mobileMenu} id="customer-mobile-menu" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `${styles.mobileLink} ${isActive ? styles.active : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
            <Link to="/discover" className={styles.mobileCta} onClick={() => setMenuOpen(false)}>Join a queue <span aria-hidden="true">→</span></Link>
          </nav>
        )}
      </div>
    </header>
  );
}
