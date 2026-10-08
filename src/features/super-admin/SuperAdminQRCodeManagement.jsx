import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { fetchAllShops, fetchAllUsers, generateShopQueueQr, regenerateShopQueueQr, setShopQueueQrStatus } from '../../api/adminApi';
import { getQrAppUrl } from '../../api/qrUrl';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../components/ui/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import styles from './SuperAdminQRCodeManagement.module.css';

const PAGE_SIZE = 8;
const QR_LABELS = { none: 'Not generated', active: 'QR Active', disabled: 'QR Disabled' };

async function fetchPageData() {
  const [shops, users] = await Promise.all([fetchAllShops(), fetchAllUsers()]);
  return { shops, users };
}

function getQr(shop) {
  return shop.queueQr || shop.qr || null;
}

function getQrState(shop) {
  const qr = getQr(shop);
  return qr?.token ? qr.status : 'none';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getOwnerId(shop) {
  return shop.ownerId && typeof shop.ownerId === 'object' ? shop.ownerId._id : shop.ownerId;
}

function getQueueUrl(token) {
  return getQrAppUrl(`/join-queue?shop=${encodeURIComponent(token)}`);
}

function makePoster(shop, qrCanvas) {
  if (!qrCanvas) throw new Error('QR code is not ready.');
  const width = 900;
  const height = 1160;
  const poster = document.createElement('canvas');
  poster.width = width;
  poster.height = height;
  const context = poster.getContext('2d');
  if (!context) throw new Error('Could not prepare the QR poster.');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  const header = context.createLinearGradient(0, 0, width, 0);
  header.addColorStop(0, '#1d1839');
  header.addColorStop(1, '#5b3fe0');
  context.fillStyle = header;
  context.fillRect(0, 0, width, 170);
  context.fillStyle = '#fff';
  context.beginPath();
  context.roundRect(60, 55, 64, 64, 16);
  context.fill();
  context.fillStyle = '#6b4bff';
  context.font = '700 40px Inter,Arial,sans-serif';
  context.textAlign = 'center';
  context.fillText('F', 92, 102);
  context.fillStyle = '#fff';
  context.textAlign = 'left';
  context.font = '700 46px Inter,Arial,sans-serif';
  context.fillText('FlowCut', 142, 104);
  context.textAlign = 'center';
  context.fillStyle = '#17142b';
  context.font = '700 50px Inter,Arial,sans-serif';
  context.fillText('Scan to join our queue', width / 2, 270);
  context.fillStyle = '#6f6b88';
  context.font = '400 27px Inter,Arial,sans-serif';
  context.fillText('Point your phone camera at the code', width / 2, 315);
  context.strokeStyle = '#e7e6f0';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(120, 350, 660, 660, 28);
  context.stroke();
  context.drawImage(qrCanvas, 150, 380, 600, 600);
  context.fillStyle = '#17142b';
  context.font = '700 44px Inter,Arial,sans-serif';
  context.fillText(shop.name, width / 2, 1075);
  context.fillStyle = '#6f6b88';
  context.font = '400 28px Inter,Arial,sans-serif';
  context.fillText(shop.address || '', width / 2, 1118);

  return new Promise((resolve, reject) => {
    poster.toBlob((blob) => {
      if (!blob) reject(new Error('Could not create QR image.'));
      else resolve({ blob, url: poster.toDataURL('image/png') });
    }, 'image/png');
  });
}

export default function SuperAdminQRCodeManagement() {
  const { data, loading, error, refetch } = useAsync(fetchPageData);
  const showToast = useToast();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('all');
  const [qrFilter, setQrFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [generateShopId, setGenerateShopId] = useState('');
  const [posterImage, setPosterImage] = useState('');
  const [printPending, setPrintPending] = useState(false);
  const [printVersion, setPrintVersion] = useState(0);
  const previewQrRef = useRef(null);
  const posterQrRef = useRef(null);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') setModal(null);
    }
    if (modal) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  if (loading) return <Skeleton height={220} />;
  if (error) return <p className={styles.error}>{error.message}</p>;

  const shops = data.shops || [];
  const users = data.users || [];
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const ownerFor = (shop) => usersById.get(String(getOwnerId(shop))) || null;
  const approvedShops = shops.filter((shop) => shop.status === 'APPROVED');
  const activeCount = approvedShops.filter((shop) => getQrState(shop) === 'active').length;
  const missingCount = approvedShops.filter((shop) => getQrState(shop) === 'none').length;
  const disabledCount = approvedShops.filter((shop) => getQrState(shop) === 'disabled').length;
  const locations = [...new Set(approvedShops.map((shop) => shop.address).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredShops = approvedShops
    .filter((shop) => location === 'all' || shop.address === location)
    .filter((shop) => qrFilter === 'all' || getQrState(shop) === qrFilter)
    .filter((shop) => !normalizedQuery || shop.name.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name));
  const pageCount = Math.max(1, Math.ceil(filteredShops.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleShops = filteredShops.slice(pageStart, pageStart + PAGE_SIZE);
  const eligibleShops = approvedShops.filter((shop) => getQrState(shop) === 'none');

  function refreshAfterChange() {
    setModal(null);
    refetch();
  }

  function openGenerate(preferredShopId) {
    if (!eligibleShops.length) {
      setModal({ type: 'all-generated' });
      return;
    }
    const nextShop = eligibleShops.find((shop) => String(shop._id) === String(preferredShopId)) || eligibleShops[0];
    setGenerateShopId(String(nextShop._id));
    setModal({ type: 'generate' });
  }

  async function generateQr() {
    const shop = eligibleShops.find((item) => String(item._id) === generateShopId);
    if (!shop) return;
    try {
      const updatedShop = await generateShopQueueQr(shop._id);
      await refetch();
      setModal({ type: 'qr', shop: updatedShop, fresh: true });
      showToast('QR generated and assigned to the shop');
    } catch (requestError) {
      showToast(requestError.message, 'error');
    }
  }

  async function runConfirm() {
    const { action, shop } = modal;
    try {
      if (action === 'regenerate') await regenerateShopQueueQr(shop._id);
      else await setShopQueueQrStatus(shop._id, action === 'disable' ? 'disabled' : 'active');
      refreshAfterChange();
      showToast(action === 'regenerate' ? 'New QR generated' : action === 'disable' ? 'QR disabled' : 'QR enabled');
    } catch (requestError) {
      showToast(requestError.message, 'error');
    }
  }

  async function downloadQr(shop) {
    try {
      const qrCanvas = posterQrRef.current?.querySelector('canvas');
      const { blob } = await makePoster(shop, qrCanvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flowcut-queue-qr-${slug(shop.name)}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast('QR downloaded');
    } catch (requestError) {
      showToast(requestError.message || 'Could not download the QR. Please try again.', 'error');
    }
  }

  async function printQr(shop) {
    try {
      const qrCanvas = posterQrRef.current?.querySelector('canvas');
      const { url } = await makePoster(shop, qrCanvas);
      setPrintPending(true);
      setPrintVersion((version) => version + 1);
      setPosterImage(url);
    } catch (requestError) {
      showToast(requestError.message || 'Could not prepare the QR for printing.', 'error');
    }
  }

  function handlePrintImageLoad() {
    if (!printPending) return;
    setPrintPending(false);
    window.print();
  }

  function renderQrActions(shop) {
    const status = getQrState(shop);
    if (status === 'none') {
      return <button className={`${styles.btn} ${styles.small} ${styles.ok}`} type="button" onClick={() => openGenerate(shop._id)}>Generate QR</button>;
    }
    if (status === 'active') {
      return <>
        <button className={`${styles.btn} ${styles.small} ${styles.ok}`} type="button" onClick={() => setModal({ type: 'qr', shop })}>View QR</button>
        <button className={`${styles.btn} ${styles.small}`} type="button" onClick={() => setModal({ type: 'confirm', action: 'regenerate', shop })}>Regenerate</button>
        <button className={`${styles.btn} ${styles.small} ${styles.no}`} type="button" onClick={() => setModal({ type: 'confirm', action: 'disable', shop })}>Disable</button>
      </>;
    }
    return <>
      <button className={`${styles.btn} ${styles.small} ${styles.ok}`} type="button" onClick={() => setModal({ type: 'confirm', action: 'enable', shop })}>Enable QR</button>
      <button className={`${styles.btn} ${styles.small}`} type="button" onClick={() => setModal({ type: 'qr', shop })}>View QR</button>
      <button className={`${styles.btn} ${styles.small}`} type="button" onClick={() => setModal({ type: 'confirm', action: 'regenerate', shop })}>Regenerate</button>
    </>;
  }

  const currentGenerationShop = eligibleShops.find((shop) => String(shop._id) === generateShopId) || eligibleShops[0];

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>PLATFORM ACCESS &amp; SECURITY</p>
            <h1>QR Code Management</h1>
            <p className={styles.sub}>Generate and manage official queue QR codes for approved FlowCut shops.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.btn} type="button" onClick={() => setModal({ type: 'guide' })}>
              <svg className={styles.iconStroke} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" /></svg>
              <span>View QR Guide</span>
            </button>
            <button className={`${styles.btn} ${styles.primary}`} type="button" onClick={() => openGenerate()}>
              <svg className={styles.iconStroke} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span>Generate QR</span>
            </button>
          </div>
        </header>

        <section className={styles.cards} aria-label="QR code overview">
          <article className={styles.stat}>
            <div className={styles.statTop}>Approved shops<span className={styles.ico}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9 5 4h14l1 5M4 9h16v11H4z" /></svg></span></div>
            <strong>{approvedShops.length}</strong><small>Eligible for a queue QR</small>
          </article>
          <article className={styles.stat}>
            <div className={styles.statTop}>QR active<span className={`${styles.ico} ${styles.green}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg></span></div>
            <strong>{activeCount}</strong><small>Customers can scan and join</small>
          </article>
          <article className={styles.stat}>
            <div className={styles.statTop}>QR not generated<span className={`${styles.ico} ${styles.amber}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span></div>
            <strong>{missingCount}</strong><small>Waiting for the Super Admin</small>
          </article>
          <article className={styles.stat}>
            <div className={styles.statTop}>QR disabled<span className={`${styles.ico} ${styles.blue}`}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m5 5 14 14" /></svg></span></div>
            <strong>{disabledCount}</strong><small>Joining paused</small>
          </article>
        </section>

        <div className={styles.toolbar}>
          <div className={styles.tools}>
            <label className={styles.search}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
              <span className={styles.srOnly}>Search shop name</span>
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search shop name" />
            </label>
            <label className={styles.srOnly} htmlFor="qr-location">Location</label>
            <select id="qr-location" value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); }}>
              <option value="all">All locations</option>
              {locations.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
            <label className={styles.srOnly} htmlFor="qr-status">QR status</label>
            <select id="qr-status" value={qrFilter} onChange={(event) => { setQrFilter(event.target.value); setPage(1); }}>
              <option value="all">All QR statuses</option>
              <option value="none">QR Not Generated</option>
              <option value="active">QR Active</option>
              <option value="disabled">QR Disabled</option>
            </select>
          </div>
        </div>

        <section className={styles.panel} aria-label="Approved shop QR codes">
          <div className={styles.thead}><span>Shop</span><span>Location</span><span>Shop admin</span><span>QR status</span><span>Created</span><span className={styles.actionHeading}>Actions</span></div>
          <div>
            {visibleShops.length === 0 && <div className={styles.empty}>No approved shops match your search or filters.</div>}
            {visibleShops.map((shop) => {
              const state = getQrState(shop);
              const qr = getQr(shop);
              const owner = ownerFor(shop);
              return (
                <article className={styles.item} key={shop._id}>
                  <div className={styles.shop}><strong>{shop.name}</strong></div>
                  <div className={styles.location}>{shop.address}</div>
                  <div className={styles.owner}>{owner?.name || '—'}</div>
                  <div><span className={`${styles.qs} ${styles[state]}`}>{QR_LABELS[state]}</span></div>
                  <div className={styles.muted}>{qr?.createdAt ? formatDate(qr.createdAt) : '—'}</div>
                  <div className={styles.rowActions}>{renderQrActions(shop)}</div>
                </article>
              );
            })}
          </div>
          <footer className={styles.pager}>
            <span>{filteredShops.length ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredShops.length)} of ${filteredShops.length} shops` : '0 shops'}</span>
            <div className={styles.pages}>
              <button className={styles.pg} type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <button className={`${styles.pg} ${number === currentPage ? styles.activePage : ''}`} type="button" key={number} onClick={() => setPage(number)}>{number}</button>
              ))}
              <button className={styles.pg} type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
            </div>
          </footer>
        </section>
        <p className={styles.note}>QR codes open the shop-specific queue. Disabled or replaced QR codes cannot be used to join.</p>
      </main>

      {modal && (
        <div className={styles.modal} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            {modal.type === 'guide' && <>
              <div className={styles.dh}><h2 id="modal-title">QR Guide</h2><button className={styles.xbtn} type="button" aria-label="Close" onClick={() => setModal(null)}>×</button></div>
              <ol className={styles.steps}>
                <li><span>You approve a shop, then generate its official queue QR here.</span></li>
                <li><span>The QR appears on that shop's <b>Shop Admin</b> dashboard, where they download or print it for the shop.</span></li>
                <li><span>A customer scans it in the shop and lands on <b>Join Queue</b> with the shop already identified, no searching.</span></li>
                <li><span>They enter the required details and are added to that shop's queue with their number and estimated wait.</span></li>
              </ol>
              <div className={styles.sec}><b>Security</b><ul><li>The QR holds only an opaque shop-specific token. It is never a login.</li><li>No credentials, passwords, or customer data are stored in it.</li><li>Disabling a QR stops customers joining through it. Regenerating replaces the token, so printed copies must be replaced.</li></ul></div>
              <div className={styles.dl}><button className={`${styles.btn} ${styles.primary}`} type="button" onClick={() => setModal(null)}>Got it</button></div>
            </>}

            {modal.type === 'all-generated' && <>
              <div className={styles.dh}><h2 id="modal-title">Generate Queue QR Code</h2><button className={styles.xbtn} type="button" aria-label="Close" onClick={() => setModal(null)}>×</button></div>
              <div className={styles.callout}>Every approved shop already has a QR code. Use <b>Regenerate</b> on a shop to replace its QR.</div>
              <div className={styles.dl}><button className={styles.btn} type="button" onClick={() => setModal(null)}>Close</button></div>
            </>}

            {modal.type === 'generate' && currentGenerationShop && <>
              <div className={styles.dh}><h2 id="modal-title">Generate Queue QR Code</h2><button className={styles.xbtn} type="button" aria-label="Close" onClick={() => setModal(null)}>×</button></div>
              <div className={styles.field}><label htmlFor="generate-shop">Approved shop</label><select id="generate-shop" value={generateShopId} onChange={(event) => setGenerateShopId(event.target.value)}>
                {eligibleShops.map((shop) => <option value={shop._id} key={shop._id}>{shop.name}</option>)}
              </select></div>
              <div className={styles.kv}>
                <div><span>Shop</span><b>{currentGenerationShop.name}</b></div>
                <div><span>Location</span><b>{currentGenerationShop.address}</b></div>
                <div><span>Shop admin</span><b>{ownerFor(currentGenerationShop)?.name || '—'}</b></div>
              </div>
              <div className={styles.callout}>This QR opens this shop's FlowCut queue, where customers can join after entering their details. It contains only an opaque shop-specific token, never login or private data.</div>
              <div className={styles.dl}><button className={styles.btn} type="button" onClick={() => setModal(null)}>Cancel</button><button className={`${styles.btn} ${styles.primary}`} type="button" onClick={generateQr}>Generate QR Code</button></div>
            </>}

            {modal.type === 'qr' && <>
              <div className={styles.dh}><h2 id="modal-title">{modal.fresh ? 'Queue QR generated' : 'FlowCut Queue QR'}</h2><button className={styles.xbtn} type="button" aria-label="Close" onClick={() => setModal(null)}>×</button></div>
              <div className={styles.dshop}>{modal.shop.name}</div><div className={styles.dloc}>{modal.shop.address}</div>
              <div className={`${styles.qrbox} ${getQrState(modal.shop) === 'disabled' ? styles.dim : ''}`} ref={previewQrRef}>
                <QRCodeCanvas value={getQueueUrl(getQr(modal.shop).token)} size={220} bgColor="#ffffff" fgColor="#17142b" level="M" />
              </div>
              <div className={styles.scan}>Scan to join this shop's queue</div>
              <div className={styles.url}>{getQueueUrl(getQr(modal.shop).token)}</div>
              {getQrState(modal.shop) === 'disabled' && <div className={`${styles.callout} ${styles.bad}`}>This QR is disabled. Customers who scan it cannot join the queue until it is enabled again.</div>}
              {modal.fresh && <div className={styles.callout}>Assigned to <b>{modal.shop.name}</b>. {ownerFor(modal.shop)?.name || 'The shop admin'} can download and print it from the Shop Admin dashboard.</div>}
              <div className={styles.dl}>
                <button className={`${styles.btn} ${styles.primary}`} type="button" disabled={getQrState(modal.shop) === 'disabled'} onClick={() => downloadQr(modal.shop)}>Download QR</button>
                <button className={styles.btn} type="button" disabled={getQrState(modal.shop) === 'disabled'} onClick={() => printQr(modal.shop)}>Print QR</button>
                <button className={styles.btn} type="button" onClick={() => setModal(null)}>{modal.fresh ? 'Done' : 'Close'}</button>
              </div>
              <div className={styles.posterQr} ref={posterQrRef} aria-hidden="true"><QRCodeCanvas value={getQueueUrl(getQr(modal.shop).token)} size={600} bgColor="#ffffff" fgColor="#17142b" level="M" /></div>
            </>}

            {modal.type === 'confirm' && <>
              <div className={styles.dh}><h2 id="modal-title">{modal.action === 'regenerate' ? 'Regenerate QR code?' : modal.action === 'disable' ? 'Disable this QR?' : 'Enable this QR?'}</h2><button className={styles.xbtn} type="button" aria-label="Close" onClick={() => setModal(null)}>×</button></div>
              <div className={`${styles.callout} ${modal.action === 'disable' ? styles.bad : styles.warn}`}>
                {modal.action === 'regenerate'
                  ? <>This creates a new QR for <b>{modal.shop.name}</b>. The previous QR will stop working, so replace printed copies.</>
                  : modal.action === 'disable'
                    ? <>Customers who scan <b>{modal.shop.name}</b>'s QR can no longer join its queue until you enable it again.</>
                    : <>Customers will be able to scan <b>{modal.shop.name}</b>'s QR and join its queue again.</>}
              </div>
              <div className={styles.dl}><button className={styles.btn} type="button" onClick={() => setModal(null)}>Cancel</button><button className={`${styles.btn} ${modal.action === 'disable' ? styles.no : styles.ok}`} type="button" onClick={runConfirm}>{modal.action === 'regenerate' ? 'Regenerate QR' : modal.action === 'disable' ? 'Disable QR' : 'Enable QR'}</button></div>
            </>}
          </section>
        </div>
      )}

      <div className={styles.printSheet}>{posterImage && <img key={printVersion} src={posterImage} alt="FlowCut queue QR poster" onLoad={handlePrintImageLoad} />}</div>
    </div>
  );
}
