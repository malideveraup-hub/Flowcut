import { useAsync } from '../../hooks/useAsync';
import { fetchAllShops } from '../../api/adminApi';
import Table from '../../components/ui/Table';
import StatusBadge from '../../components/ui/StatusBadge';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Dashboard.module.css';

const STATUS_META = {
  PENDING: { label: 'Pending', level: 'moderate' },
  APPROVED: { label: 'Approved', level: 'low' },
  REJECTED: { label: 'Rejected', level: 'high' },
  SUSPENDED: { label: 'Suspended', level: 'high' },
};

export default function ShopManagement() {
  const { data: shops, loading, error } = useAsync(fetchAllShops);

  if (loading) return <Skeleton height={220} />;
  if (error) return <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>;

  const columns = [
    { key: 'name', header: 'Shop' },
    { key: 'address', header: 'Address' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const meta = STATUS_META[row.status] || { label: row.status, level: 'moderate' };
        return <StatusBadge skin="clean" level={meta.level} label={meta.label} />;
      },
    },
  ];

  return (
    <div>
      <h1 className={styles.title}>Shops</h1>
      <p className={styles.sub}>{(shops || []).length} shops on the platform</p>
      <div className={styles.panel}>
        <Table columns={columns} rows={(shops || []).map((s) => ({ ...s, id: s._id }))} emptyMessage="No shops yet." />
      </div>
    </div>
  );
}
