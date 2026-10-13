import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

export default function Modal({ open, onClose, title, children, skin = 'clean', initialFocusRef = null }) {
  const ref = useRef(null);
  const previousFocusRef = useRef(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) previousFocusRef.current?.focus?.();
      wasOpenRef.current = false;
      return undefined;
    }

    wasOpenRef.current = true;
    previousFocusRef.current = document.activeElement;
    (initialFocusRef?.current || ref.current)?.focus();

    function onKey(event) {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;

      const focusable = [...ref.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        ref.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, initialFocusRef]);

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
