import { useAsync } from '../../hooks/useAsync';
import { fetchAllShops, approveShop, rejectShop } from '../../api/adminApi';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import styles from './Dashboard.module.css';

export default function ShopApproval() {
  const { data: shops, loading, error, refetch } = useAsync(fetchAllShops);
  const showToast = useToast();

  if (loading) return <Skeleton height={220} />;
  if (error) return <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>;

  const pending = (shops || []).filter((s) => s.status === 'PENDING');

  async function handleApprove(shop) {
    try {
      await approveShop(shop._id);
      showToast(`${shop.name} approved`);
      refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleReject(shop) {
    try {
      await rejectShop(shop._id);
      showToast(`${shop.name} rejected`);
      refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div>
      <h1 className={styles.title}>Shop approvals</h1>
      <p className={styles.sub}>{pending.length} pending</p>

      {pending.length === 0 && (
        <EmptyState title="No pending shops" body="New shop applications will show up here." />
      )}

      {pending.map((shop) => (
        <div className={styles.panel} key={shop._id}>
          <p className={styles.panelTitle}>{shop.name}</p>
          <div className={styles.row}>
            <span>Address</span>
            <span className={styles.strong}>{shop.address}</span>
          </div>
          <div className={styles.row}>
            <span>Contact</span>
            <span className={styles.strong}>{shop.contact?.phone}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="sm" variant="success" onClick={() => handleApprove(shop)}>
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleReject(shop)}>
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
