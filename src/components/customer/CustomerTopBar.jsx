import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { fetchMyFavorites, fetchMyQueueHistory } from '../../api/shopApi';
import { useAuth } from '../../hooks/useAuth';
import BrandLogo from '../ui/BrandLogo';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import styles from './CustomerTopBar.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/discover', label: 'Discover' },
  { to: '/guide', label: 'Guide' },
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

const PUSH_PROMPT_STORAGE_PREFIX = 'flowcut:push-prompt-dismissed:';

function AccountIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ACCOUNT_ICONS[name]}</svg>;
}

export default function CustomerTopBar({ notificationState, showNotifications = false }) {
  const [activePopup, setActivePopup] = useState(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(null);
  const [favoritesCount, setFavoritesCount] = useState(null);
  const [pushPromptDismissed, setPushPromptDismissed] = useState(false);
  const [pushPromptUserKey, setPushPromptUserKey] = useState('');
  const notificationRef = useRef(null);
  const notificationTriggerRef = useRef(null);
  const accountRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuTriggerRef = useRef(null);
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
    browserPushOptedOut,
    browserPushStatusReady,
    browserPushNeedsHomeScreen,
    enableBrowserAlerts,
    disableBrowserPush,
  } = notificationState;
  const pushPromptIdentity = user?.id || user?.email || '';
  const menuOpen = activePopup === 'menu';
  const notificationsOpen = activePopup === 'notifications';
  const accountOpen = activePopup === 'account';

  useEffect(() => {
    if (!showNotifications || !pushPromptIdentity) {
      setPushPromptDismissed(false);
      setPushPromptUserKey('');
      return undefined;
    }
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(`${PUSH_PROMPT_STORAGE_PREFIX}${pushPromptIdentity}`) === 'true';
    } catch {
      // The prompt can still be dismissed for this page session if storage is blocked.
    }
    setPushPromptDismissed(dismissed);
    setPushPromptUserKey(pushPromptIdentity);
    return undefined;
  }, [showNotifications, pushPromptIdentity]);

  function dismissPushPrompt() {
    setPushPromptDismissed(true);
    try {
      window.localStorage.setItem(`${PUSH_PROMPT_STORAGE_PREFIX}${pushPromptIdentity}`, 'true');
    } catch {
      // Keep the dismissal for this page session if browser storage is unavailable.
    }
  }

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
    if (!activePopup) return undefined;
    function closeOnOutsidePointer(event) {
      const insidePopup = notificationRef.current?.contains(event.target)
        || accountRef.current?.contains(event.target)
        || menuRef.current?.contains(event.target)
        || menuTriggerRef.current?.contains(event.target);
      if (!insidePopup) setActivePopup(null);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        const trigger = activePopup === 'account'
          ? accountTriggerRef.current
          : activePopup === 'notifications'
            ? notificationTriggerRef.current
            : menuTriggerRef.current;
        setActivePopup(null);
        trigger?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [activePopup]);

  function toggleNotifications() {
    setActivePopup((current) => current === 'notifications' ? null : 'notifications');
    void refresh().catch(() => {});
  }

  function toggleAccount() {
    setActivePopup((current) => current === 'account' ? null : 'account');
  }

  function closeAccount() {
    setActivePopup(null);
  }

  async function handleLogout() {
    setLogoutOpen(false);
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
    setActivePopup(null);
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
        <Link to="/" className={styles.logo} onClick={() => setActivePopup(null)}>
          <BrandLogo />
        </Link>
        <nav className={styles.links} aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
              onClick={() => setActivePopup(null)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.actions}>
          <Link to="/discover" className={styles.joinLink} onClick={() => setActivePopup(null)}>Join a queue</Link>
          {showNotifications && <div className={styles.notificationWrap} ref={notificationRef}>
            <button
              ref={notificationTriggerRef}
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
                    <p className={styles.browserAlertStatus}>Change FlowCut notification permission in your browser or device settings, then return here. The browser will not show another permission prompt while access is blocked. Page sound works while FlowCut is open.</p>
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
                  {browserPushEnabled && (
                    <button
                      type="button"
                      className={styles.enableBrowserAlertsButton}
                      onClick={() => void disableBrowserPush()}
                      disabled={browserAlertBusy}
                    >
                      {browserAlertBusy ? 'Updating alerts…' : 'Disable push alerts on this device'}
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
                  onClick={() => setActivePopup(null)}
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
                  <button className={`${styles.accountItem} ${styles.logoutItem}`} type="button" onClick={() => { closeAccount(); setLogoutOpen(true); }}>
                    <AccountIcon name="logout" /><span>Log out</span>
                  </button>
                </div>
              </section>
            )}
          </div>}
          <button
            ref={menuTriggerRef}
            className={styles.menuButton}
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="customer-mobile-menu"
            onClick={() => setActivePopup((current) => current === 'menu' ? null : 'menu')}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        {menuOpen && (
          <nav ref={menuRef} className={styles.mobileMenu} id="customer-mobile-menu" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `${styles.mobileLink} ${isActive ? styles.active : ''}`}
                onClick={() => setActivePopup(null)}
              >
                {item.label}
              </NavLink>
            ))}
            <Link to="/discover" className={styles.mobileCta} onClick={() => setActivePopup(null)}>Join a queue <span aria-hidden="true">→</span></Link>
          </nav>
        )}
      </div>
      {showNotifications
        && pushPromptIdentity
        && pushPromptUserKey === pushPromptIdentity
        && !pushPromptDismissed
        && !browserPushEnabled
        && !browserPushOptedOut
        && browserPushStatusReady
        && browserPushConfigured === true
        && ['default', 'granted'].includes(browserAlertPermission)
        && (
          <aside className={styles.pushOptInPrompt} aria-labelledby="push-opt-in-title">
            <div className={styles.pushOptInCopy}>
              <strong id="push-opt-in-title">Queue reminders, even when FlowCut is closed</strong>
              <p>Enable notifications to know when your turn is getting close.</p>
              {browserPushNeedsHomeScreen && (
                <p className={styles.pushOptInHint}>On iPhone or iPad, first use Share → Add to Home Screen, then open FlowCut from its icon.</p>
              )}
              {browserAlertError && <p className={styles.pushOptInError}>{browserAlertError}</p>}
            </div>
            <div className={styles.pushOptInActions}>
              <button
                type="button"
                className={styles.pushOptInEnable}
                onClick={() => void enableBrowserAlerts()}
                disabled={browserAlertBusy}
              >
                {browserAlertBusy ? 'Enabling…' : 'Enable Notifications'}
              </button>
              <button type="button" className={styles.pushOptInDismiss} onClick={dismissPushPrompt}>
                Not Now
              </button>
            </div>
          </aside>
        )}
      <Modal skin="clean" open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out?">
        <p>Are you sure you want to log out?</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button skin="clean" variant="secondary" onClick={() => setLogoutOpen(false)}>Cancel</Button>
          <Button skin="clean" variant="destructive" onClick={() => void handleLogout()}>Log out</Button>
        </div>
      </Modal>
    </header>
  );
}
