import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchAllShops, fetchAllUsers } from '../../api/adminApi';
import Skeleton from '../../components/ui/Skeleton';
import styles from './UserManagement.module.css';

const PAGE_SIZE = 8;
const ROLE_LABELS = {
  customer: 'Customer',
  barber: 'Barber',
  shop_admin: 'Shop admin',
  super_admin: 'Super admin',
};

async function fetchUsersPageData() {
  const [users, shops] = await Promise.all([fetchAllUsers(), fetchAllShops()]);
  return { users, shops };
}

export default function UserManagement() {
  const { data, loading, error } = useAsync(fetchUsersPageData);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);

  if (loading) return <Skeleton height={220} />;
  if (error) return <p className={styles.error}>{error.message}</p>;

  const allUsers = data.users || [];
  const shopsById = new Map((data.shops || []).map((shop) => [String(shop._id), shop.name]));
  const getShopName = (user) => {
    if (!user.shopId) return '';
    const shopId = typeof user.shopId === 'object' ? user.shopId._id : user.shopId;
    return shopsById.get(String(shopId)) || '';
  };
  const searchTerm = query.trim().toLowerCase();
  const filteredUsers = allUsers
    .filter((user) => roleFilter === 'all' || user.role === roleFilter)
    .filter((user) => statusFilter === 'all' || (user.status || 'ACTIVE') === statusFilter)
    .filter((user) => !searchTerm || `${user.name} ${user.email || ''}`.toLowerCase().includes(searchTerm))
    .sort((left, right) => {
      if (sort === 'oldest') return new Date(left.createdAt) - new Date(right.createdAt);
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'role') return left.role.localeCompare(right.role) || left.name.localeCompare(right.name);
      if (sort === 'shop') return getShopName(left).localeCompare(getShopName(right)) || left.name.localeCompare(right.name);
      if (sort === 'status') return (left.status || 'ACTIVE').localeCompare(right.status || 'ACTIVE') || left.name.localeCompare(right.name);
      return new Date(right.createdAt) - new Date(left.createdAt);
    });
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleUsers = filteredUsers.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>FLOWCUT PLATFORM</p>
          <h1>Users</h1>
          <p className={styles.sub}>{allUsers.length} accounts</p>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.filterTools}>
          <label className={styles.search}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
            <span className={styles.srOnly}>Search users</span>
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search by name or email" />
          </label>
          <label className={styles.selectLabel}>
            <span className={styles.srOnly}>Filter by role</span>
            <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}>
              <option value="all">All roles</option>
              <option value="customer">Customer</option>
              <option value="barber">Barber</option>
              <option value="shop_admin">Shop admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </label>
          <label className={styles.selectLabel}>
            <span className={styles.srOnly}>Filter by account status</span>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
            </select>
          </label>
        </div>
        <label className={styles.sortLabel}>
          <span>Sort by</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="name">Name</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="role">Role</option>
            <option value="shop">Shop</option>
            <option value="status">Account status</option>
          </select>
        </label>
      </div>

      <section className={styles.tablePanel} aria-label="Users list">
        <div className={styles.tableHead}>
          <span>Name</span><span>Email</span><span>Role</span><span>Shop</span><span>Account status</span>
        </div>
        <div>
          {visibleUsers.length === 0 && (
            <div className={styles.empty}>{allUsers.length ? 'No users match your search or filter.' : 'No user accounts yet.'}</div>
          )}
          {visibleUsers.map((user) => (
            <article className={styles.userRow} key={user._id}>
              <div className={styles.userName}>
                <span className={styles.avatar} aria-hidden="true">{user.name?.charAt(0)?.toUpperCase() || '?'}</span>
                <strong>{user.name}</strong>
              </div>
              <span className={styles.email}>{user.email || '—'}</span>
              <span><span className={`${styles.roleBadge} ${styles[user.role] || ''}`}>{ROLE_LABELS[user.role] || user.role}</span></span>
              <span className={`${styles.shopAssignment} ${getShopName(user) ? styles.hasShop : ''}`}>{getShopName(user) || '—'}</span>
              <span><span className={styles.activeStatus}>Active</span></span>
            </article>
          ))}
        </div>
        <footer className={styles.pager}>
          <span>{filteredUsers.length ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredUsers.length)} of ${filteredUsers.length} users` : '0 users'}</span>
          <div className={styles.pageButtons}>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>{currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
