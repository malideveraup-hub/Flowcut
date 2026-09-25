import { useAsync } from '../../hooks/useAsync';
import { fetchAllUsers } from '../../api/adminApi';
import Table from '../../components/ui/Table';
import StatusBadge from '../../components/ui/StatusBadge';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Dashboard.module.css';

const ROLE_LABEL = {
  customer: 'Customer',
  barber: 'Barber',
  shop_admin: 'Shop admin',
  super_admin: 'Super admin',
};

export default function UserManagement() {
  const { data: users, loading, error } = useAsync(fetchAllUsers);

  if (loading) return <Skeleton height={220} />;
  if (error) return <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>;

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'mobileNumber', header: 'Mobile' },
    { key: 'role', header: 'Role', render: (r) => ROLE_LABEL[r.role] || r.role },
    {
      key: 'shopId',
      header: 'Shop',
      render: (r) => (r.shopId ? <StatusBadge skin="clean" level="low" label="Assigned" /> : '—'),
    },
  ];

  return (
    <div>
      <h1 className={styles.title}>Users</h1>
      <p className={styles.sub}>{(users || []).length} accounts</p>
      <div className={styles.panel}>
        <Table columns={columns} rows={(users || []).map((u) => ({ ...u, id: u._id }))} />
      </div>
    </div>
  );
}
