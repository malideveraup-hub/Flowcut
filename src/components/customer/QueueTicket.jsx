import styles from './QueueTicket.module.css';

export default function QueueTicket({ shopName, position, waitMin, waitMax }) {
  return (
    <div className={styles.ticket}>
      <div className={styles.shopName}>{shopName}</div>
      <div className={styles.position}>#{position}</div>
      <div className={styles.wait}>
        {waitMin}–{waitMax} MIN
      </div>
      <div className={styles.waitLabel}>estimated wait</div>
    </div>
  );
}
