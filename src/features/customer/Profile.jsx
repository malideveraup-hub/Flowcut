import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { deleteAccountRequest, updateProfileRequest } from '../../api/authApi';
import {
  fetchMyShopApplication,
  fetchMyQueueHistory,
  fetchMyFavorites,
  removeMyFavorite,
} from '../../api/shopApi';
import { validateName } from '../../validation/authValidation';
import { filterNameInput } from '../../utils/inputFilters';
import { useToast } from '../../components/ui/ToastContext';
import styles from './Profile.module.css';

const ICONS = {
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  heart: '<path d="M12 21s-7-4.5-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12C19 16.5 12 21 12 21Z"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  shop: '<path d="m4 9 1-5h14l1 5M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
};

function Icon({ name, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

function EmptyState({ type, title, children, action }) {
  return (
    <div className={`${styles.card} ${styles.empty}`}>
      <span className={styles.emptyIcon}><Icon name={type} /></span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

function ProfileSettings({ user, onSave, onLogout, onDeleteAccount, shopApplication }) {
  const [value, setValue] = useState(user?.name || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!confirm) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !deleting) setConfirm(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirm, deleting]);

  const ownerState = shopApplication?.status?.toLowerCase() || 'none';
  const ownerCopy = {
    none: {
      pill: 'Not a shop owner',
      title: 'Own a barbershop?',
      text: 'Apply to list your shop on FlowCut and manage your own queue.',
      action: <Link className={`${styles.button} ${styles.solid}`} to="/register-shop">Apply as shop owner</Link>,
    },
    pending: {
      pill: 'Application pending',
      title: 'Application under review',
      text: `We're reviewing ${shopApplication?.name ? `${shopApplication.name}'s details` : 'your shop details'}. You'll be notified once a decision is made.`,
    },
    draft: {
      pill: 'Draft in progress',
      title: shopApplication?.name || 'Shop application draft',
      text: 'Continue your shop application when you’re ready to add the required documents and submit it for review.',
      action: <Link className={`${styles.button} ${styles.solid}`} to="/register-shop">Continue application</Link>,
    },
    approved: {
      pill: 'Approved shop owner',
      title: shopApplication?.name || 'Your shop',
      text: 'Your shop is live on FlowCut. Manage your queue, barbers and services from your shop dashboard.',
      action: <Link className={styles.button} to="/admin">Open shop dashboard</Link>,
    },
    rejected: {
      pill: 'Application declined',
      title: shopApplication?.name || 'Shop application',
      text: 'Your previous shop application was declined. You may submit a new application.',
      action: <Link className={`${styles.button} ${styles.solid}`} to="/register-shop">Apply again</Link>,
    },
    suspended: {
      pill: 'Shop suspended',
      title: shopApplication?.name || 'Your shop',
      text: 'Your shop is currently suspended. Contact support for more information.',
    },
  }[ownerState] || {
    pill: 'Shop status unavailable',
    title: shopApplication?.name || 'Your shop',
    text: 'Your shop-owner status is currently unavailable.',
  };

  async function handleSave(event) {
    event.preventDefault();
    const validationError = validateName(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      await onSave(value.trim());
      setError('');
      showToast('Profile updated');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDeleteAccount();
    } catch (deleteError) {
      showToast(deleteError.message, 'error');
      setDeleting(false);
      setConfirm(null);
    }
  }

  return (
    <>
      <div className={styles.settingsGrid}>
        <section className={`${styles.card} ${styles.settingsCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.settingsIcon}><Icon name="person" /></span>
            <div><h2>Account details</h2><p>How your name appears across FlowCut.</p></div>
          </div>
          <form className={styles.profileForm} onSubmit={handleSave} noValidate>
            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor="profile-name">
                <span>Display name</span>
                <input id="profile-name" value={value} maxLength={40} autoComplete="nickname" onChange={(event) => setValue(filterNameInput(event.target.value))} />
                {error && <small className={styles.error}>{error}</small>}
              </label>
              <label className={styles.field} htmlFor="profile-email">
                <span>Email</span>
                <input id="profile-email" value={user?.email || ''} readOnly />
              </label>
            </div>
            <p className={styles.hint}>Your email comes from your sign-in and can't be changed here.</p>
            <div className={styles.actions}>
              <button className={`${styles.button} ${styles.solid}`} type="submit" disabled={saving || !value.trim() || value.trim() === user?.name}>{saving ? 'Saving…' : 'Save changes'}</button>
              <button className={styles.button} type="button" onClick={() => { setValue(user?.name || ''); setError(''); }} disabled={value === (user?.name || '')}>Reset</button>
            </div>
          </form>
        </section>

        <section className={`${styles.card} ${styles.settingsCard}`}>
          <div className={styles.cardHeading}>
            <span className={styles.settingsIcon}><Icon name="shop" /></span>
            <div><h2>Shop owner</h2><p>Your shop-owner status on FlowCut.</p></div>
          </div>
          <div className={styles.ownerStatus}>
            <span className={`${styles.ownerMark} ${ownerState === 'approved' ? styles.approvedMark : ''}`}><Icon name="shop" /></span>
            <div>
              <strong>{ownerCopy.title}</strong>
              <p>{ownerCopy.text}</p>
              <span className={`${styles.pill} ${styles[ownerState] || ''}`}>{ownerCopy.pill}</span>
            </div>
          </div>
          {ownerCopy.action && <div className={styles.actions}>{ownerCopy.action}</div>}
        </section>

        <section className={`${styles.card} ${styles.accountCard}`}>
          <div className={styles.cardHeading}>
            <span className={`${styles.settingsIcon} ${styles.dangerIcon}`}><Icon name="shield" /></span>
            <div><h2>Account</h2><p>Sign out or permanently remove your account.</p></div>
          </div>
          <div className={styles.accountActions}>
            <div className={styles.actionTile}>
              <div><strong>Log out</strong><small>Sign out of FlowCut on this device.</small></div>
              <button className={styles.button} type="button" onClick={() => setConfirm('logout')}>Log out</button>
            </div>
            <div className={`${styles.actionTile} ${styles.deleteTile}`}>
              <div><strong>Delete account</strong><small>Permanently remove your account and personal information.</small></div>
              <button className={`${styles.button} ${styles.dangerButton}`} type="button" onClick={() => { setConfirm('delete'); setConfirmText(''); }}>Delete account</button>
            </div>
          </div>
        </section>
      </div>

      {confirm && (
        <div className={styles.modal} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirm(null); }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">{confirm === 'logout' ? 'Log out?' : 'Delete your account?'}</h2>
            <p>{confirm === 'logout' ? 'Sign out of FlowCut on this device.' : 'This permanently removes your account and cannot be undone. Type DELETE to confirm.'}</p>
            {confirm === 'delete' && <input className={styles.confirmInput} aria-label="Type DELETE to confirm" placeholder="DELETE" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />}
            <div className={styles.dialogActions}>
              <button className={styles.button} type="button" onClick={() => setConfirm(null)} disabled={deleting}>Cancel</button>
              <button className={`${styles.button} ${styles.dangerSolid}`} type="button" onClick={confirm === 'logout' ? onLogout : confirmDelete} disabled={deleting || (confirm === 'delete' && confirmText !== 'DELETE')}>
                {deleting ? 'Deleting…' : confirm === 'logout' ? 'Log out' : 'Delete account'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => ['history', 'favorites', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'history');
  const [shopApplication, setShopApplication] = useState(null);
  const [history, setHistory] = useState({ items: [], total: 0, completedTotal: 0, page: 1, pageSize: 5 });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState('');
  const [removingFavorite, setRemovingFavorite] = useState(null);
  const showToast = useToast();
  const fullName = user?.name || 'Your profile';
  const initial = fullName.trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    let active = true;
    fetchMyShopApplication().then((shop) => {
      if (active) setShopApplication(shop);
    }).catch(() => {
      if (active) setShopApplication(null);
    });
    fetchMyQueueHistory(1, 5).then((result) => {
      if (active) setHistory(result);
    }).catch((error) => {
      if (active) setHistoryError(error.message);
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    fetchMyFavorites().then((shops) => {
      if (active) setFavorites(shops);
    }).catch((error) => {
      if (active) setFavoritesError(error.message);
    }).finally(() => {
      if (active) setFavoritesLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function loadMoreHistory() {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const nextPage = history.page + 1;
      const result = await fetchMyQueueHistory(nextPage, history.pageSize);
      setHistory((current) => ({ ...result, items: [...current.items, ...result.items] }));
    } catch (error) {
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function reloadHistory() {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      setHistory(await fetchMyQueueHistory(1, 5));
    } catch (error) {
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function reloadFavorites() {
    setFavoritesLoading(true);
    setFavoritesError('');
    try {
      setFavorites(await fetchMyFavorites());
    } catch (error) {
      setFavoritesError(error.message);
    } finally {
      setFavoritesLoading(false);
    }
  }

  async function handleRemoveFavorite(shop) {
    setRemovingFavorite(shop.id);
    try {
      await removeMyFavorite(shop.id);
      setFavorites((current) => current.filter((favorite) => favorite.id !== shop.id));
      showToast('Removed from favorites');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setRemovingFavorite(null);
    }
  }

  function selectTab(tab) {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  }

  async function handleSaveName(newName) {
    const { data } = await updateProfileRequest({ name: newName });
    setUser(data.user);
  }

  async function handleLogout() {
    await logout();
    showToast("You've been logged out");
    navigate('/');
  }

  async function handleDeleteAccount() {
    await deleteAccountRequest();
    setUser(null);
    showToast('Account deleted');
    navigate('/');
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.profileHeader}>
          <div className={styles.avatar}>{initial}</div>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>PROFILE</p>
            <h1>{fullName}</h1>
            <p className={styles.email}>{user?.email || ''}</p>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}><strong>{history.completedTotal}</strong><span>Cuts completed</span></div>
            <div className={styles.stat}><strong>{favorites.length}</strong><span>Favorites</span></div>
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Profile sections">
          {[
            { id: 'history', label: 'History', count: history.total },
            { id: 'favorites', label: 'Favorites', count: favorites.length },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button key={tab.id} id={`tab-${tab.id}`} className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => selectTab(tab.id)}>
              {tab.label}{tab.count !== undefined && <small>{tab.count}</small>}
            </button>
          ))}
        </div>

        <main className={styles.main}>
          <section id="panel-history" className={styles.panel} role="tabpanel" aria-labelledby="tab-history" hidden={activeTab !== 'history'}>
            {historyLoading && history.items.length === 0 ? (
              <div className={`${styles.card} ${styles.empty}`}><p className={styles.stateMessage}>Loading history…</p></div>
            ) : historyError && history.items.length === 0 ? (
              <EmptyState type="history" title="Couldn't load history" action={<button className={styles.button} type="button" onClick={reloadHistory}>Try again</button>}>{historyError}</EmptyState>
            ) : history.items.length === 0 ? (
              <EmptyState type="history" title="No queue history yet" action={<Link className={`${styles.button} ${styles.solid}`} to="/discover">Find a shop</Link>}>
                Once you join a queue and get your cut, your visits will show up here.
              </EmptyState>
            ) : (
              <div className={`${styles.card} ${styles.historyCard}`}>
                {history.items.map((visit) => {
                  const statusClass = visit.status === 'COMPLETED' ? styles.completed : visit.status === 'CANCELLED' ? styles.cancelled : styles.left;
                  const statusLabel = visit.status === 'COMPLETED' ? 'Completed' : visit.status === 'CANCELLED' ? 'Cancelled' : 'Left queue';
                  const duration = [
                    visit.waitMinutes != null ? `${visit.waitMinutes} min wait` : null,
                    visit.serviceMinutes != null ? `${visit.serviceMinutes} min service` : null,
                  ].filter(Boolean).join(' · ') || '—';
                  return (
                    <div className={styles.historyRow} key={visit.id}>
                      <div className={styles.historyThumb} aria-hidden="true" />
                      <div className={styles.visitDetails}>
                        <strong>{visit.shop}</strong>
                        <small>{visit.service}{visit.barber ? ` · ${visit.barber}` : ''}</small>
                      </div>
                      <div className={`${styles.visitDate} ${styles.muted}`}>{new Date(visit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div className={`${styles.visitDuration} ${styles.muted}`}>{duration}</div>
                      <span className={`${styles.pill} ${statusClass}`}>{statusLabel}</span>
                      {visit.shopId ? <Link className={`${styles.button} ${styles.smallButton}`} to={`/shops/${visit.shopId}/join`}>Queue again</Link> : <span />}
                    </div>
                  );
                })}
                <div className={styles.historyFooter}>
                  <span>Showing {history.items.length} of {history.total} visits</span>
                  {history.items.length < history.total && <button className={`${styles.button} ${styles.smallButton}`} type="button" onClick={loadMoreHistory} disabled={historyLoading}>{historyLoading ? 'Loading…' : 'Load more'}</button>}
                </div>
                {historyError && <p className={styles.inlineError}>{historyError}</p>}
              </div>
            )}
          </section>
          <section id="panel-favorites" className={styles.panel} role="tabpanel" aria-labelledby="tab-favorites" hidden={activeTab !== 'favorites'}>
            {favoritesLoading ? (
              <div className={`${styles.card} ${styles.empty}`}><p className={styles.stateMessage}>Loading favorites…</p></div>
            ) : favoritesError ? (
              <EmptyState type="heart" title="Couldn't load favorites" action={<button className={styles.button} type="button" onClick={reloadFavorites}>Try again</button>}>{favoritesError}</EmptyState>
            ) : favorites.length === 0 ? (
              <EmptyState type="heart" title="No favorite shops yet" action={<Link className={`${styles.button} ${styles.solid}`} to="/discover">Discover shops</Link>}>
                Tap the heart on a shop's details page to save it here for quick access.
              </EmptyState>
            ) : (
              <div className={styles.favoriteGrid}>
                {favorites.map((shop) => (
                  <article className={`${styles.card} ${styles.favoriteCard}`} key={shop.id}>
                    <div className={styles.favoriteThumb}>
                      <button className={styles.heartButton} type="button" aria-label={`Remove ${shop.name} from favorites`} onClick={() => handleRemoveFavorite(shop)} disabled={removingFavorite === shop.id}>
                        <Icon name="heart" className={styles.heartIcon} />
                      </button>
                    </div>
                    <div className={styles.favoriteBody}>
                      <h2>{shop.name}</h2>
                      <p className={styles.favoriteMeta}>
                        <span className={styles.rating}>{shop.rating == null ? 'Rating unavailable' : `★ ${shop.rating}`}</span>
                        {' · '}{shop.distanceMiles == null ? 'Distance unavailable' : `${shop.distanceMiles} mi`}
                        {' · '}{shop.serviceName || 'Services unavailable'}
                      </p>
                      <p className={`${styles.waitText} ${shop.waitMinutes === 0 ? styles.noWait : ''}`}>
                        {shop.waitMinutes === 0 ? 'No wait' : shop.waitMinutes == null ? 'Wait unavailable' : `${shop.waitMinutes} min wait`}
                      </p>
                      <Link className={styles.button} to={`/shops/${shop.id}`}>View shop</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section id="panel-settings" className={styles.panel} role="tabpanel" aria-labelledby="tab-settings" hidden={activeTab !== 'settings'}>
            <ProfileSettings user={user} onSave={handleSaveName} onLogout={handleLogout} onDeleteAccount={handleDeleteAccount} shopApplication={shopApplication} />
          </section>
        </main>
      </div>
    </div>
  );
}
