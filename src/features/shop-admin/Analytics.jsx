import MetricCard from '../../components/staff/MetricCard';
import styles from './Dashboard.module.css';
import barStyles from './Analytics.module.css';

const HOURLY = [
  { hour: '9a', wait: 10 },
  { hour: '11a', wait: 18 },
  { hour: '1p', wait: 32 },
  { hour: '3p', wait: 28 },
  { hour: '5p', wait: 40 },
  { hour: '7p', wait: 15 },
];

export default function Analytics() {
  const max = Math.max(...HOURLY.map((h) => h.wait));

  return (
    <div>
      <h1 className={styles.title}>Analytics</h1>
      <p className={styles.sub}>Fade District · Last 7 days</p>

      <div className={styles.metricGrid}>
        <MetricCard label="Avg wait" value="24 min" />
        <MetricCard label="Avg service time" value="29 min" />
        <MetricCard label="Customers served" value="186" />
        <MetricCard label="Predicted vs actual" value="±6 min" />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Average wait by hour</p>
        <div className={barStyles.chart}>
          {HOURLY.map((h) => (
            <div className={barStyles.col} key={h.hour}>
              <div className={barStyles.bar} style={{ height: `${(h.wait / max) * 100}%` }} />
              <span className={barStyles.value}>{h.wait}</span>
              <span className={barStyles.label}>{h.hour}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Peak hours</p>
        <div className={styles.row}>
          <span>Busiest</span>
          <span className={styles.strong}>5:00–6:00 PM</span>
        </div>
        <div className={styles.row}>
          <span>Quietest</span>
          <span className={styles.strong}>9:00–10:00 AM</span>
        </div>
      </div>
    </div>
  );
}
