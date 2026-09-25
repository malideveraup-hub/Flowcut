import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useSession } from '../../api/session';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/ToastContext';
import styles from './Dashboard.module.css';
import qrStyles from './QRManagement.module.css';

export default function QRManagement() {
  // shopId comes from the authenticated session, exactly like every other
  // Shop Admin screen. It is never an editable field — a Shop Admin can
  // only ever see/print the QR for their OWN shop (Section 6).
  const { shopId } = useSession();
  const showToast = useToast();
  const canvasRef = useRef(null);

  // window.location.origin reflects wherever this frontend is actually
  // running (localhost in dev, the real domain once deployed) — Section 4
  // says not to hardcode a production URL before one exists.
  const joinUrl = `${window.location.origin}/join/${shopId}`;

  function handleCopy() {
    navigator.clipboard
      .writeText(joinUrl)
      .then(() => showToast('Join link copied'))
      .catch(() => showToast('Could not copy — copy it manually', 'error'));
  }

  function handleDownload() {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `flowcut-${shopId}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <div>
      <h1 className={styles.title}>Shop QR code</h1>
      <p className={styles.sub}>Fade District · scan to join this shop's queue</p>

      <div className={styles.panel} style={{ maxWidth: 360, textAlign: 'center' }}>
        <div ref={canvasRef} className={qrStyles.qrWrap}>
          <QRCodeCanvas value={joinUrl} size={200} bgColor="#ffffff" fgColor="#1b1b1d" level="M" />
        </div>

        <p className={qrStyles.link}>{joinUrl}</p>

        <div className={qrStyles.actions}>
          <Button size="sm" variant="secondary" onClick={handleCopy}>
            Copy link
          </Button>
          <Button size="sm" onClick={handleDownload}>
            Download PNG
          </Button>
        </div>
      </div>

      <p className={qrStyles.note}>
        Printing directly from here uses your browser's print function on this page. A dedicated print-layout
        endpoint can be added once the backend serves a static asset version of this code.
      </p>
    </div>
  );
}
