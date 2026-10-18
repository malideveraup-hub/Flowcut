import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchOwnShopQueueQr } from '../../api/shopAdminApi';
import { getQrAppUrl } from '../../api/qrUrl';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../components/ui/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import styles from './QRManagement.module.css';

function shopSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatAssignedDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  return new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function QRManagement() {
  const { data, loading, error } = useAsync(fetchOwnShopQueueQr);
  const showToast = useToast();
  const qrRef = useRef(null);
  const printQrRef = useRef(null);

  if (loading) return <Skeleton height={220} />;
  if (error) return <p className={styles.error}>{error.message}</p>;

  const shop = data?.shop;
  const qr = data?.qr;
  const active = Boolean(qr?.payload && qr.status === 'active');
  const qrUrl = qr?.payload ? getQrAppUrl(qr.payload) : '';
  const shopLabel = shop?.name || 'Your shop';

  async function downloadQr() {
    const svg = qrRef.current?.querySelector('svg');
    if (!active || !svg) return;

    try {
      const serialized = new XMLSerializer().serializeToString(svg);
      const svgUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1200;
        const context = canvas.getContext('2d');
        if (!context) {
          URL.revokeObjectURL(svgUrl);
          showToast('QR download is unavailable', 'error');
          return;
        }
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob((blob) => {
          if (!blob) {
            showToast('QR download is unavailable', 'error');
            return;
          }
          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `${shopSlug(shop.name)}-qr.png`;
          link.click();
          URL.revokeObjectURL(pngUrl);
          showToast('QR image saved');
        }, 'image/png');
      };
      image.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        showToast('QR download is unavailable', 'error');
      };
      image.src = svgUrl;
    } catch {
      showToast('QR download is unavailable', 'error');
    }
  }

  function printQr() {
    if (!active || !printQrRef.current?.querySelector('svg')) return;
    window.print();
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.head}>
          <div>
            <div className={styles.shopEyebrow}>{shopLabel.toUpperCase()}</div>
            <h1>Shop QR Code</h1>
            <p className={styles.sub}>Display this QR code in your shop so customers can scan it to join your queue.</p>
          </div>
          <div className={styles.buttons}>
            <button className={styles.button} type="button" disabled={!active} onClick={downloadQr}>Download QR</button>
            <button className={`${styles.button} ${styles.primary}`} type="button" disabled={!active} onClick={printQr}>Print QR</button>
          </div>
        </header>

        <section className={`${styles.card} ${styles.banner} ${!active ? styles.bannerInactive : ''}`} aria-label="QR status">
          <div className={`${styles.tick} ${!active ? styles.tickInactive : ''}`} aria-hidden="true">{active ? '✓' : '!'}</div>
          <div className={styles.bannerText}>
            <span className={`${styles.badge} ${!active ? styles.badgeInactive : ''}`}>{active ? 'QR CODE ACTIVE' : qr?.status === 'disabled' ? 'QR CODE DISABLED' : 'QR CODE NOT ASSIGNED'}</span>
            <h2>{shop?.name || 'Shop details unavailable'}</h2>
            <p>{shop?.address || 'Shop address unavailable'}</p>
          </div>
          <p className={styles.bannerNote}>{active
            ? 'This QR code is assigned to your shop. Customers can scan it to join your queue.'
            : qr?.status === 'disabled'
              ? 'This QR code has been disabled. Contact the Super Admin to enable it again.'
              : 'Your shop does not have an assigned QR code yet. Please contact the Super Admin.'}</p>
        </section>

        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.qrCard}`} aria-label="Shop QR code">
            {active ? (
              <div className={styles.qrBox} ref={qrRef} role="img" aria-label={`QR code for ${shop.name}`}>
                <QRCodeSVG value={qrUrl} size={320} level="M" bgColor="#ffffff" fgColor="#17142e" />
              </div>
            ) : (
              <div className={`${styles.qrBox} ${styles.qrPlaceholder}`} aria-hidden="true">
                <span>{qr?.status === 'disabled' ? 'QR disabled' : 'QR not assigned'}</span>
              </div>
            )}
            <h3>{shopLabel}</h3>
            <p className={styles.scan}>Scan to join our queue</p>
            <p className={styles.hint}>Customers can scan this code with their phone camera to join the queue.</p>
            <div className={styles.buttons}>
              <button className={styles.button} type="button" disabled={!active} onClick={downloadQr}>Download QR</button>
              <button className={`${styles.button} ${styles.primary}`} type="button" disabled={!active} onClick={printQr}>Print QR</button>
            </div>
            {active && <p className={styles.qrUrl}>{qrUrl}</p>}
          </section>

          <div className={styles.right}>
            <section className={`${styles.card} ${styles.infoCard}`}>
              <h3 className={styles.sectionTitle}>How it works</h3>
              <ol className={styles.steps}>
                <li><span>1</span>Customer scans the QR code.</li>
                <li><span>2</span>Customer enters the required information.</li>
                <li><span>3</span>Customer selects the service or barber if required.</li>
                <li><span>4</span>Customer is automatically added to this shop's queue.</li>
                <li><span>5</span>The entry appears in your Queue management page.</li>
              </ol>
              <p className={styles.note}>This QR code is permanently connected to your registered shop.</p>
            </section>

            <section className={`${styles.card} ${styles.infoCard}`}>
              <h3 className={styles.sectionTitle}>QR assignment</h3>
              <dl className={styles.details}>
                <div><dt>Assigned shop</dt><dd>{shop?.name || '—'}</dd></div>
                <div><dt>QR Code ID</dt><dd>{qr?.id || '—'}</dd></div>
                <div><dt>Status</dt><dd><span className={`${styles.badge} ${active ? '' : styles.badgeInactive}`}>{active ? 'Active' : qr ? 'Disabled' : 'Not assigned'}</span></dd></div>
                <div><dt>Assigned by</dt><dd>{qr?.assignedBy || '—'}</dd></div>
                <div><dt>Date assigned</dt><dd>{formatAssignedDate(qr?.assignedAt)}</dd></div>
              </dl>
              <p className={styles.lock}>Only the Super Admin can change or replace this QR code.</p>
            </section>
          </div>
        </div>
      </main>

      {active && (
        <div className={styles.printLayout} ref={printQrRef} aria-hidden="true">
          <div className={styles.printLogo}><i>F</i>FlowCut</div>
          <QRCodeSVG value={qrUrl} size={420} level="M" bgColor="#ffffff" fgColor="#17142e" />
          <h2>{shop.name}</h2>
          <p>Scan to join our queue</p>
        </div>
      )}
    </div>
  );
}
