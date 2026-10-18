import styles from './Timer.module.css';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Timer({ seconds, size = 'lg' }) {
  return (
    <div className={[styles.timer, styles[size]].join(' ')} aria-live="off">
      {formatElapsed(seconds)}
    </div>
  );
}
