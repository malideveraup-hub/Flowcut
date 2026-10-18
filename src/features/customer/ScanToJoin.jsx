import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import styles from './ScanToJoin.module.css';

/**
 * "Scan to Join" entry point (Section 5). No QR scanning library is
 * installed in this prototype, so this component deliberately does NOT
 * simulate a fake camera/scan result — that would misrepresent what the
 * app can currently do.
 *
 * What's real here:
 *  - The route/component exists and is reachable from the Customer nav.
 *  - Scanner UI is fully isolated from queue-joining logic: whatever scan
 *    result eventually comes back (a shopId), this screen's only job is
 *    to hand off to <JoinRedirect> at /join/:shopId — the exact same path
 *    a real camera scan would produce. No queue logic lives in this file.
 *  - A manual fallback lets the flow be tested/used today, and gives
 *    customers a way to join even on a device without camera access.
 *
 * To make scanning real: install a scanner library (e.g. a
 * getUserMedia-based QR reader), replace the placeholder viewfinder
 * below with its video element, and on a successful decode call
 * `navigate(`/join/${decodedShopId}`)` — no other file needs to change.
 */
export default function ScanToJoin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function handleManualSubmit(e) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter a shop code.');
      return;
    }
    navigate(`/join/${trimmed}`);
  }

  return (
    <div>
      <p className={styles.sectionLabel}>Scan to join</p>

      <div className={styles.viewfinder}>
        <div className={styles.corner} style={{ top: 12, left: 12, borderRight: 'none', borderBottom: 'none' }} />
        <div className={styles.corner} style={{ top: 12, right: 12, borderLeft: 'none', borderBottom: 'none' }} />
        <div className={styles.corner} style={{ bottom: 12, left: 12, borderRight: 'none', borderTop: 'none' }} />
        <div className={styles.corner} style={{ bottom: 12, right: 12, borderLeft: 'none', borderTop: 'none' }} />
        <p className={styles.placeholderText}>Camera scanning isn't wired up yet in this build.</p>
      </div>

      <p className={styles.explain}>
        Point your camera at the QR code on the counter to jump straight to that shop. In the meantime, you can enter
        a shop code manually or browse shops instead.
      </p>

      <form onSubmit={handleManualSubmit} noValidate className={styles.manualForm}>
        <Input
          label="Shop code"
          placeholder="e.g. shop-1"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error}
        />
        <Button skin="pixel" fullWidth type="submit">
          Go to shop
        </Button>
      </form>

      <Button skin="pixel" variant="secondary" fullWidth onClick={() => navigate('/discover')}>
        Browse shops instead
      </Button>
    </div>
  );
}
