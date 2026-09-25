import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

export default function Modal({ open, onClose, title, children, skin = 'clean' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (open && ref.current) ref.current.focus();
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={[styles.dialog, styles[skin]].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className={styles.title}>{title}</h2>}
        <div>{children}</div>
      </div>
    </div>
  );
}
