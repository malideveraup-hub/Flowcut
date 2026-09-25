import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Tabs from '../../components/ui/Tabs';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../hooks/useAuth';
import {
  updateProfileRequest,
  deleteAccountRequest,
} from '../../api/authApi';
import { fetchMyShopApplication } from '../../api/shopApi';
import { validateName } from '../../validation/authValidation';
import { filterNameInput } from '../../utils/inputFilters';
import { useToast } from '../../components/ui/ToastContext';
import Button from '../../components/ui/Button';
import styles from './Profile.module.css';

const HISTORY = [];

const FAVORITES = [];

function ProfileSettings({
  name,
  onSave,
  onLogout,
  onDeleteAccount,
  shopApplication,
}) {
  const [value, setValue] = useState(name || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const showToast = useToast();

  async function handleSave(e) {
    e.preventDefault();

    const err = validateName(value);

    if (err) {
      setError(err);
      return;
    }

    setSaving(true);

    try {
      await onSave(value.trim());
      setError('');
      showToast('Profile updated');
    } catch (err2) {
      setError(err2.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);

    try {
      await onDeleteAccount();
    } catch (err) {
      showToast(err.message, 'error');
      setDeleting(false);
    }
  }

  return (
    <div className={styles.list}>

      {/* PROFILE INFORMATION */}
      <form onSubmit={handleSave} noValidate>
        <Input
          label="Display name"
          labelClassName={styles.displayNameLabel}
          value={value}
          onChange={(e) =>
            setValue(filterNameInput(e.target.value))
          }
          error={error}
        />

        <Button
          skin="pixel"
          type="submit"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </form>


      {/* SHOP REGISTRATION */}
      <div
        style={{
          marginTop: 30,
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 14,
            fontWeight: 700,
            color: '#ffffff',
          }}
        >
          Shop Owner
        </p>

        {/* NO APPLICATION */}
        {!shopApplication && (
          <>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.5,
              }}
            >
              Own a barbershop? Register your shop and submit it
              for Super Admin approval.
            </p>

            <Link
              to="/register-shop"
              style={{
                textDecoration: 'none',
              }}
            >
              <Button skin="pixel">
                Register a Shop
              </Button>
            </Link>
          </>
        )}

        {/* PENDING */}
        {shopApplication?.status === 'PENDING' && (
          <>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.5,
              }}
            >
              Your application for{' '}
              <strong>{shopApplication.name}</strong> is currently
              under review by a Super Admin.
            </p>

            <Button
              skin="pixel"
              disabled
            >
              Application Under Review
            </Button>
          </>
        )}

        {/* APPROVED */}
        {shopApplication?.status === 'APPROVED' && (
          <>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.5,
              }}
            >
              Your shop{' '}
              <strong>{shopApplication.name}</strong> has been
              approved.
            </p>

            <Link
              to="/shop-admin"
              style={{
                textDecoration: 'none',
              }}
            >
              <Button skin="pixel">
                Go to Shop Dashboard
              </Button>
            </Link>
          </>
        )}

        {/* REJECTED */}
        {shopApplication?.status === 'REJECTED' && (
          <>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.5,
              }}
            >
              Your previous shop application was rejected.
              You may submit a new application.
            </p>

            <Link
              to="/register-shop"
              style={{
                textDecoration: 'none',
              }}
            >
              <Button skin="pixel">
                Register Again
              </Button>
            </Link>
          </>
        )}

        {/* SUSPENDED */}
        {shopApplication?.status === 'SUSPENDED' && (
          <>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                lineHeight: 1.5,
              }}
            >
              Your shop{' '}
              <strong>{shopApplication.name}</strong> is currently
              suspended.
            </p>

            <Button
              skin="pixel"
              disabled
            >
              Shop Suspended
            </Button>
          </>
        )}
      </div>


      {/* ACCOUNT ACTIONS */}
      <div
        style={{
          marginTop: 30,
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 12,
            width: '100%',
          }}
        >

          {/* LOG OUT */}
          <div style={{ flex: 1 }}>
            <Button
              skin="pixel"
              variant="secondary"
              onClick={() => setLogoutOpen(true)}
              style={{
                width: '100%',
              }}
            >
              Log out
            </Button>
          </div>

          {/* DELETE ACCOUNT */}
          <div style={{ flex: 1 }}>
            <Button
              skin="pixel"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              style={{
                width: '100%',
              }}
            >
              Delete account
            </Button>
          </div>
        </div>
      </div>


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
            onClick={() => {
              setLogoutOpen(false);
              onLogout();
            }}
          >
            Log out
          </Button>
        </div>
      </Modal>


      {/* DELETE ACCOUNT MODAL */}
      <Modal
        skin="pixel"
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
      >
        <p style={{ marginBottom: 12 }}>
          This cannot be undone. Type{' '}
          <strong>DELETE</strong> to confirm.
        </p>

        <Input
          value={confirmText}
          onChange={(e) =>
            setConfirmText(e.target.value)
          }
          placeholder="DELETE"
        />

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
            onClick={() => setDeleteOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>

          <Button
            skin="pixel"
            variant="destructive"
            onClick={handleDelete}
            disabled={
              confirmText !== 'DELETE' || deleting
            }
          >
            {deleting
              ? 'Deleting…'
              : 'Permanently delete'}
          </Button>
        </div>
      </Modal>

    </div>
  );
}


export default function Profile() {
  const { name, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [shopApplication, setShopApplication] = useState(null);

  useEffect(() => {
    async function loadShopApplication() {
      try {
        const shop = await fetchMyShopApplication();
        setShopApplication(shop);
      } catch (err) {
        console.error(
          'Failed to load shop application:',
          err
        );
      }
    }

    loadShopApplication();
  }, []);

  async function handleSaveName(newName) {
    const { data } = await updateProfileRequest({
      name: newName,
    });

    setUser(data.user);
  }

  async function handleDeleteAccount() {
    await deleteAccountRequest();

    setUser(null);
    navigate('/');
  }

  return (
    <div>
      <p className={styles.sectionLabel}>
        Profile
      </p>

      <h1 className={styles.name}>
        {name || 'You'}
      </h1>

      <Tabs
        skin="pixel"
        tabs={[
          {
            label: 'History',
            content: (
              <div className={styles.list}>
                {HISTORY.map((h) => (
                  <div
                    className={styles.row}
                    key={h.id}
                  >
                    <div>
                      <div className={styles.rowTitle}>
                        {h.shop}
                      </div>

                      <div className={styles.rowSub}>
                        {h.service}
                      </div>
                    </div>

                    <div className={styles.rowDate}>
                      {h.date}
                    </div>
                  </div>
                ))}
              </div>
            ),
          },

          {
            label: 'Favorites',
            content: (
              <div className={styles.list}>
                {FAVORITES.map((f) => (
                  <div
                    className={styles.row}
                    key={f.id}
                  >
                    <div className={styles.rowTitle}>
                      {f.shop}
                    </div>
                  </div>
                ))}
              </div>
            ),
          },

          {
            label: 'Settings',
            content: (
              <ProfileSettings
                name={name}
                onSave={handleSaveName}
                onLogout={logout}
                onDeleteAccount={handleDeleteAccount}
                shopApplication={shopApplication}
              />
            ),
          },
        ]}
      />
    </div>
  );
}