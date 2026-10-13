import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { fetchMyFavorites, fetchMyQueueHistory } from '../../api/shopApi';
import { useAuth } from '../../hooks/useAuth';
import styles from './CustomerTopBar.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/discover', label: 'Discover' },
  { to: '/guide', label: 'Website Guide' },
  { to: '/my-queue', label: 'My Queue' },
  { to: '/profile', label: 'Profile' },
];

function notificationTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const ACCOUNT_ICONS = {
  queue: <><path d="M3.5 13h3l2.2-7 3.8 12 2.1-7h5.9" /></>,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  favorites: <><path d="M20.8 8.8c0 5.1-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.8A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8.8 2.2Z" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.4-3.5 3.1-5.5 7-5.5s6.6 2 7 5.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6.3v-2.6h.2A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2H15v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
};

function AccountIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ACCOUNT_ICONS[name]}</svg>;
}

export default function CustomerTopBar({ notificationState, showNotifications = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(null);
  const [favoritesCount, setFavoritesCount] = useState(null);
  const notificationRef = useRef(null);
  const accountRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  const emailName = email.split('@')[0].trim();
  const displayName = (typeof user?.name === 'string' ? user.name.trim() : '') || emailName || 'FlowCut customer';
  const avatarInitial = displayName.charAt(0).toLocaleUpperCase() || 'F';
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
    browserPushEnabled,
    browserPushConfigured,
    browserPushNeedsHomeScreen,
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

  useEffect(() => {
    if (!accountOpen || !showNotifications || !user) return undefined;
    let active = true;

    fetchMyQueueHistory(1, 1).then((history) => {
      if (active) setHistoryCount(Number.isFinite(history?.total) ? history.total : null);
    }).catch(() => {
      if (active) setHistoryCount(null);
    });
    fetchMyFavorites().then((favorites) => {
      if (active) setFavoritesCount(Array.isArray(favorites) ? favorites.length : null);
    }).catch(() => {
      if (active) setFavoritesCount(null);
    });

    return () => { active = false; };
  }, [accountOpen, showNotifications, user]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    function closeOnOutsidePointer(event) {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountOpen]);

  function toggleNotifications() {
    setNotificationsOpen((open) => !open);
    setAccountOpen(false);
    setMenuOpen(false);
    void refresh().catch(() => {});
  }

  function toggleAccount() {
    setAccountOpen((open) => !open);
    setNotificationsOpen(false);
    setMenuOpen(false);
  }

  function closeAccount() {
    setAccountOpen(false);
  }

  async function handleLogout() {
    closeAccount();
    try {
      await logout();
    } catch {
      // AuthContext clears local state even if remote session invalidation fails.
    } finally {
      navigate('/login', { replace: true });
    }
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
                  {browserPushEnabled ? (
                    <p className={styles.browserAlertStatus}>
                      Push reminders are enabled for when FlowCut is closed. {browserAlertSoundEnabled
                        ? 'Page sound is also enabled while FlowCut is open.'
                        : 'Enable page sound for reminders while FlowCut is open.'}
                    </p>
                  ) : browserPushNeedsHomeScreen ? (
                    <p className={styles.browserAlertStatus}>
                      On iPhone or iPad, use Share → Add to Home Screen, then open FlowCut from its icon and enable alerts here.
                    </p>
                  ) : browserPushConfigured === false ? (
                    <p className={styles.browserAlertStatus}>
                      Closed-browser reminders are not configured on this server yet. Page sound and browser alerts work while FlowCut is open.
                    </p>
                  ) : browserAlertPermission === 'denied' ? (
                    <p className={styles.browserAlertStatus}>Allow notifications for FlowCut in your browser settings. Page sound works while FlowCut is open.</p>
                  ) : browserAlertPermission === 'unsupported' ? (
                    <p className={styles.browserAlertStatus}>This browser cannot show system notifications. Page sound works while FlowCut is open.</p>
                  ) : browserAlertPermission === 'granted' ? (
                    <p className={styles.browserAlertStatus}>
                      {browserAlertError
                        ? 'Push alerts could not be enabled. Page sound works while FlowCut is open.'
                        : 'Turn on push alerts to receive your 10- and 5-minute reminders while FlowCut is closed.'}
                    </p>
                  ) : (
                    <p className={styles.browserAlertStatus}>Get a sound and push reminder when your turn is about 10 or 5 minutes away.</p>
                  )}
                  {(!browserPushEnabled || !browserAlertSoundEnabled) && (
                    <button
                      type="button"
                      className={styles.enableBrowserAlertsButton}
                      onClick={() => void enableBrowserAlerts()}
                      disabled={browserAlertBusy}
                    >
                      {browserAlertBusy
                        ? 'Enabling alerts…'
                        : browserPushEnabled
                          ? 'Enable page sound'
                          : browserPushNeedsHomeScreen || browserPushConfigured === false || browserAlertPermission === 'denied' || browserAlertPermission === 'unsupported'
                            ? 'Enable page sound'
                            : browserAlertError
                              ? 'Retry push alerts'
                              : 'Enable push alerts and sound'}
                    </button>
                  )}
                  {browserAlertError && !browserPushNeedsHomeScreen && (
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
          {showNotifications && <div className={styles.accountWrap} ref={accountRef}>
            <button
              ref={accountTriggerRef}
              className={styles.accountTrigger}
              type="button"
              aria-label={`Account menu for ${displayName}`}
              aria-expanded={accountOpen}
              aria-controls="customer-account-menu"
              onClick={toggleAccount}
            >
              <span className={styles.accountAvatar} aria-hidden="true">{avatarInitial}</span>
              <svg className={`${styles.accountChevron} ${accountOpen ? styles.accountChevronOpen : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4.5 6.25 3.5 3.5 3.5-3.5" /></svg>
            </button>
            {accountOpen && (
              <section className={styles.accountDropdown} id="customer-account-menu" aria-label="Account menu">
                <div className={styles.accountUser}>
                  <span className={`${styles.accountAvatar} ${styles.accountAvatarLarge}`} aria-hidden="true">{avatarInitial}</span>
                  <span className={styles.accountIdentity}>
                    <strong title={displayName}>{displayName}</strong>
                    <span title={email}>{email || 'Email unavailable'}</span>
                  </span>
                </div>

                <div className={styles.accountGroup}>
                  <p className={styles.accountHeading}>Activity</p>
                  <Link className={styles.accountItem} to="/my-queue" onClick={closeAccount}><AccountIcon name="queue" /><span>My Queue</span></Link>
                  <Link className={styles.accountItem} to="/profile#history" onClick={closeAccount}>
                    <AccountIcon name="history" /><span>History</span>{historyCount !== null && <span className={styles.accountCount}>{historyCount}</span>}
                  </Link>
                  <Link className={styles.accountItem} to="/profile#favorites" onClick={closeAccount}>
                    <AccountIcon name="favorites" /><span>Favorites</span>{favoritesCount !== null && <span className={styles.accountCount}>{favoritesCount}</span>}
                  </Link>
                </div>

                <div className={styles.accountGroup}>
                  <p className={styles.accountHeading}>Account</p>
                  <Link className={styles.accountItem} to="/profile" onClick={closeAccount}><AccountIcon name="profile" /><span>Profile</span></Link>
                  <Link className={styles.accountItem} to="/profile#settings" onClick={closeAccount}><AccountIcon name="settings" /><span>Settings</span></Link>
                </div>

                <div className={styles.accountLogout}>
                  <button className={`${styles.accountItem} ${styles.logoutItem}`} type="button" onClick={() => void handleLogout()}>
                    <AccountIcon name="logout" /><span>Log out</span>
                  </button>
                </div>
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
