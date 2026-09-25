import styles from './EmptyState.module.css';

export default function EmptyState({ title, body, actionLabel, onAction, skin = 'clean' }) {
  return (
    <div className={[styles.wrap, styles[skin]].join(' ')}>
      <p className={styles.title}>{title}</p>
      {body && <p className={styles.body}>{body}</p>}
      {actionLabel && (
        <button className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
