import { useState } from 'react';
import { TERMS_SUMMARY, PRIVACY_SUMMARY } from '../../constants/legal';
import Modal from '../../components/ui/Modal';
import styles from './ConsentFields.module.css';

/**
 * Section 12: consent checkboxes must never be pre-checked, and the user
 * must actively check each one. `checked` always starts false in every
 * caller (Register.jsx, Consent.jsx) — there is no path that defaults
 * either box to true.
 */
export default function ConsentFields({ termsAccepted, privacyAccepted, onChange, error }) {
  const [openDoc, setOpenDoc] = useState(null); // 'terms' | 'privacy' | null

  return (
    <div className={styles.wrap}>
      <div className={styles.summaryBox}>
        <p className={styles.summaryTitle}>What FlowCut collects, and why</p>
        <ul className={styles.summaryList}>
          {PRIVACY_SUMMARY.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => onChange('termsAccepted', e.target.checked)}
        />
        <span>
          I have read and agree to the{' '}
          <button type="button" className={styles.linkLike} onClick={() => setOpenDoc('terms')}>
            Terms and Conditions
          </button>
        </span>
      </label>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={privacyAccepted}
          onChange={(e) => onChange('privacyAccepted', e.target.checked)}
        />
        <span>
          I have read and agree to the{' '}
          <button type="button" className={styles.linkLike} onClick={() => setOpenDoc('privacy')}>
            Privacy / Data Use Notice
          </button>
        </span>
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <Modal open={openDoc === 'terms'} onClose={() => setOpenDoc(null)} title="Terms and Conditions">
        <ul className={styles.modalList}>
          {TERMS_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Modal>

      <Modal open={openDoc === 'privacy'} onClose={() => setOpenDoc(null)} title="Privacy / Data Use Notice">
        <ul className={styles.modalList}>
          {PRIVACY_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
