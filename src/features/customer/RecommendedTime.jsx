import styles from './RecommendedTime.module.css';

export default function RecommendedTime() {
  return (
    <div>
      <p className={styles.sectionLabel}>Recommended time</p>
      <p className={styles.intro}>Fade District — based on today's activity</p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Now</div>
          <div className={styles.cardNum}>25–35</div>
          <div className={styles.cardSub}>min wait</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Later</div>
          <div className={styles.cardNum}>10–20</div>
          <div className={styles.cardSub}>min wait</div>
        </div>
        <div className={[styles.card, styles.best].join(' ')}>
          <div className={[styles.cardTitle, styles.bestTitle].join(' ')}>Best time</div>
          <div className={styles.cardNum}>4:30</div>
          <div className={styles.cardSub}>10–20 min wait</div>
        </div>
      </div>

      <p className={styles.footnote}>
        Estimates update as the queue changes — check back before you head out for the latest number.
      </p>
    </div>
  );
}
