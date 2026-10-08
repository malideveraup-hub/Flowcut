import { useState } from 'react';
import { approveShop, fetchAllShops, fetchAllUsers, rejectShop } from '../../api/adminApi';
import { useAsync } from '../../hooks/useAsync';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import styles from './ShopApproval.module.css';

const PAGE_SIZE = 6;
const DOCUMENTS = [
  'Business registration (DTI/SEC)',
  "Mayor's / business permit",
  'Barber license or certificate',
  'Owner government ID',
];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function getOwner(shop, users) {
  const ownerId = shop.ownerId?._id || shop.ownerId;
  return users.find((user) => String(user._id) === String(ownerId)) || shop.ownerId || null;
}

function getDocuments(shop) {
  return Array.isArray(shop.documents) ? shop.documents : [];
}

function getDocumentName(document, index) {
  return document.name || document.label || document.fileName || DOCUMENTS[index] || `Document ${index + 1}`;
}

function getDocumentUrl(document) {
  return document.url || document.fileUrl || document.path || '';
}

export default function ShopApproval() {
  const { data, loading, error, refetch } = useAsync(() => Promise.all([fetchAllShops(), fetchAllUsers()]));
  const showToast = useToast();
  const [filter, setFilter] = useState('PENDING');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('oldest');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState(null);

  const shops = data?.[0] || [];
  const users = data?.[1] || [];

  if (loading) return <Skeleton height={220} />;
  if (error) return <p className={styles.error}>{error.message}</p>;

  const counts = shops.reduce((summary, shop) => {
    summary[shop.status] = (summary[shop.status] || 0) + 1;
    return summary;
  }, {});
  const normalizedQuery = query.trim().toLowerCase();
  const filteredShops = shops
    .filter((shop) => filter === 'ALL' || shop.status === filter)
    .filter((shop) => {
      const owner = getOwner(shop, users);
      return !normalizedQuery || `${shop.name} ${shop.address || ''} ${owner?.name || ''}`.toLowerCase().includes(normalizedQuery);
    })
    .sort((left, right) => {
      if (sort === 'oldest') return new Date(left.createdAt) - new Date(right.createdAt);
      if (sort === 'location') return (left.address || '').localeCompare(right.address || '') || left.name.localeCompare(right.name);
      if (sort === 'status') return left.status.localeCompare(right.status) || new Date(left.createdAt) - new Date(right.createdAt);
      return new Date(right.createdAt) - new Date(left.createdAt);
    });
  const pageCount = Math.max(1, Math.ceil(filteredShops.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleShops = filteredShops.slice(pageStart, pageStart + PAGE_SIZE);

  function changeFilter(nextFilter) {
    setFilter(nextFilter);
    setPage(1);
  }

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

  async function handleReject(shop) {
    try {
      await rejectShop(shop._id);
      showToast(`${shop.name} rejected`);
      setReviewing(null);
      refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function reviewPending() {
    changeFilter('PENDING');
    setSort('oldest');
    document.getElementById('approval-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function viewRequirements() {
    document.getElementById('approval-checklist')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const filters = [
    { id: 'PENDING', label: 'Pending', count: counts.PENDING || 0 },
    { id: 'APPROVED', label: 'Approved', count: counts.APPROVED || 0 },
    { id: 'REJECTED', label: 'Rejected', count: counts.REJECTED || 0 },
    { id: 'ALL', label: 'All', count: shops.length },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>TRUST &amp; ONBOARDING</p>
          <h1>Shop approvals</h1>
          <p className={styles.sub}>Review business details and documents before shops join the FlowCut network.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={viewRequirements}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
            View Requirements
          </button>
          <button className={`${styles.button} ${styles.primary}`} type="button" onClick={reviewPending}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
            Review Pending
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Filter applications by status">
          {filters.map((item) => (
            <button
              className={`${styles.tab} ${filter === item.id ? styles.activeTab : ''}`}
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => changeFilter(item.id)}
            >
              {item.label}<small>{item.count}</small>
            </button>
          ))}
        </div>
        <div className={styles.tools}>
          <label className={styles.search}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
            <span className={styles.srOnly}>Search shop or owner</span>
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search shop or owner" />
          </label>
          <label className={styles.sortLabel}>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="location">Location</option>
              <option value="status">Application status</option>
            </select>
          </label>
        </div>
      </div>

      <section className={styles.tablePanel} id="approval-list" aria-label="Shop applications">
        <div className={styles.tableHead}>
          <span>Shop &amp; owner</span><span>Location</span><span>Submitted</span><span>Documents</span><span>Review status</span><span className={styles.actionHeading}>Actions</span>
        </div>
        <div>
          {visibleShops.length === 0 && (
            <div className={styles.empty}>{shops.length ? 'No applications match your search or filters.' : 'No shop applications have been submitted yet.'}</div>
          )}
          {visibleShops.map((shop) => {
            const owner = getOwner(shop, users);
            const documents = getDocuments(shop);
            const statusClass = shop.status === 'APPROVED' ? styles.approved : shop.status === 'PENDING' ? styles.pending : shop.status === 'SUSPENDED' ? styles.suspended : styles.rejected;
            return (
              <article className={styles.applicationRow} key={shop._id}>
                <div className={styles.shop}>
                  <strong>{shop.name}</strong>
                  <span>Owner · {owner?.name || 'Owner details unavailable'}</span>
                  <small>{shop.contact?.phone || 'No contact number'}</small>
                </div>
                <div className={styles.location}>{shop.address || 'Address not provided'}</div>
                <time className={styles.submitted} dateTime={shop.createdAt}>{formatDate(shop.createdAt)}</time>
                <div className={styles.documentCell}>
                  <button className={styles.documentButton} type="button" onClick={() => setReviewing(shop)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" /></svg>
                    {documents.length} document{documents.length === 1 ? '' : 's'}
                  </button>
                </div>
                <div className={styles.statusCell}><span className={`${styles.status} ${statusClass}`}>{shop.status === 'PENDING' ? 'Needs review' : shop.status}</span></div>
                <div className={styles.rowActions}>
                  {shop.status === 'PENDING' && <button className={`${styles.actionButton} ${styles.rejectButton}`} type="button" onClick={() => handleReject(shop)}>Reject</button>}
                  <button className={styles.actionButton} type="button" onClick={() => setReviewing(shop)}>Review</button>
                  {shop.status === 'PENDING' && <button className={`${styles.actionButton} ${styles.approveButton}`} type="button" onClick={() => handleApprove(shop)}>Approve</button>}
                </div>
              </article>
            );
          })}
        </div>
        <footer className={styles.pager}>
          <span>{filteredShops.length ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredShops.length)} of ${filteredShops.length} applications` : '0 applications'}</span>
          <div className={styles.pageButtons}>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>{currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
          </div>
        </footer>
      </section>

      <section className={styles.checklist} id="approval-checklist">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
        <div>
          <h2>Approval checklist</h2>
          <ul>
            <li>Business registration (DTI/SEC) is valid</li>
            <li>Barber licenses or certificates provided</li>
            <li>Shop address matches submitted documents</li>
            <li>Mayor's/business permit is current</li>
            <li>Owner ID matches the registered account</li>
            <li>Contact email is verified</li>
          </ul>
        </div>
      </section>

      {reviewing && (
        <div className={styles.modal} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewing(null); }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="review-title">
            <div className={styles.dialogHeading}>
              <div><h2 id="review-title">{reviewing.name}</h2><p>Owner · {getOwner(reviewing, users)?.name || 'Owner details unavailable'} · {reviewing.address || 'Address not provided'}</p></div>
              <button className={styles.closeButton} type="button" aria-label="Close review" onClick={() => setReviewing(null)}>×</button>
            </div>
            <div className={styles.documentHeading}><strong>Submitted documents</strong><span>{getDocuments(reviewing).length} of {DOCUMENTS.length} on file</span></div>
            <ul className={styles.documentList}>
              {DOCUMENTS.map((label, index) => {
                const document = getDocuments(reviewing)[index];
                const url = document ? getDocumentUrl(document) : '';
                return (
                  <li key={label}>
                    <span className={styles.fileMark} aria-hidden="true">{document ? '✓' : '—'}</span>
                    <span>{document ? getDocumentName(document, index) : label}</span>
                    {document && url
                      ? <a href={url} target="_blank" rel="noreferrer">View file</a>
                      : <small>{document ? 'File details unavailable' : 'Not on file'}</small>}
                  </li>
                );
              })}
            </ul>
            <div className={styles.dialogActions}>
              <button className={styles.actionButton} type="button" onClick={() => setReviewing(null)}>Close</button>
              {reviewing.status === 'PENDING' && <button className={`${styles.actionButton} ${styles.rejectButton}`} type="button" onClick={() => handleReject(reviewing)}>Reject</button>}
              {reviewing.status === 'PENDING' && <button className={`${styles.actionButton} ${styles.approveButton}`} type="button" onClick={() => { handleApprove(reviewing); setReviewing(null); }}>Approve</button>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
