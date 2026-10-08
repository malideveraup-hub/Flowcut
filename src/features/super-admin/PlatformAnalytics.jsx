import { useEffect, useState } from 'react';
import { fetchBasicAnalytics, fetchCompletedServiceAnalytics } from '../../api/adminApi';
import Skeleton from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import styles from './PlatformAnalytics.module.css';

const RANGE_LABELS = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  '6m': 'Last 6 Months',
  year: 'This Year',
  custom: 'Custom Range',
};
const DURATION_RANGES = [
  { label: '0-20 minutes', max: 20 },
  { label: '21-30 minutes', max: 30 },
  { label: '31-40 minutes', max: 40 },
  { label: '41-50 minutes', max: 50 },
  { label: '51-60 minutes', max: 60 },
  { label: '60+ minutes', max: Infinity },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function localDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthBuckets(start, end) {
  const buckets = [];
  const includesMultipleYears = start.getFullYear() !== addDays(end, -1).getFullYear();
  for (let month = new Date(start.getFullYear(), start.getMonth(), 1); month < end; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    buckets.push({
      label: `${MONTHS[month.getMonth()]}${includesMultipleYears ? ` '${String(month.getFullYear()).slice(-2)}` : ''}`,
      start: month,
      end: next,
    });
  }
  return buckets;
}

function getDateRange(selection, now = new Date()) {
  const today = startOfDay(now);
  let start;
  let end;
  let buckets = [];
  let label = RANGE_LABELS[selection.key];

  if (selection.key === 'today') {
    start = today;
    end = addDays(today, 1);
    for (let hour = 9; hour <= 20; hour += 1) {
      const bucketStart = new Date(today);
      const bucketEnd = new Date(today);
      bucketStart.setHours(hour);
      bucketEnd.setHours(hour + 1);
      buckets.push({ label: `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`, start: bucketStart, end: bucketEnd });
    }
  } else if (selection.key === 'week') {
    const mondayOffset = (today.getDay() + 6) % 7;
    start = addDays(today, -mondayOffset);
    end = addDays(start, 7);
    buckets = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => ({
      label: day,
      start: addDays(start, index),
      end: addDays(start, index + 1),
    }));
  } else if (selection.key === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    for (let bucketStart = start, index = 1; bucketStart < end; bucketStart = addDays(bucketStart, 7), index += 1) {
      const bucketEnd = addDays(bucketStart, 7);
      buckets.push({ label: `Wk ${index}`, start: bucketStart, end: bucketEnd < end ? bucketEnd : end });
    }
  } else if (selection.key === '6m') {
    start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    buckets = monthBuckets(start, end);
  } else if (selection.key === 'year') {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear() + 1, 0, 1);
    buckets = monthBuckets(start, end);
  } else {
    start = new Date(`${selection.from}T00:00:00`);
    end = addDays(new Date(`${selection.to}T00:00:00`), 1);
    const dayCount = Math.round((end - start) / 86400000);
    if (dayCount <= 31) {
      buckets = Array.from({ length: dayCount }, (_, index) => ({
        label: String(addDays(start, index).getDate()),
        start: addDays(start, index),
        end: addDays(start, index + 1),
      }));
    } else {
      buckets = monthBuckets(start, end);
    }
    const lastDay = addDays(end, -1);
    label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  const duration = Math.max(end - start, 3600000);
  return { start, end, buckets, label, previousStart: new Date(start.getTime() - duration), previousEnd: start };
}

function isValidDate(value) {
  return value && !Number.isNaN(new Date(value).getTime());
}

function isCompletedRecord(record) {
  return record.status === 'completed' && isValidDate(record.service_finished);
}

function getDuration(record) {
  if (!isValidDate(record.service_started) || !isValidDate(record.service_finished)) return null;
  const minutes = (new Date(record.service_finished) - new Date(record.service_started)) / 60000;
  return minutes > 0 ? minutes : null;
}

function formatMoney(amount) {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`;
}

function percentChange(current, previous) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function formatPercent(value) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function bucketIndex(minutes) {
  return DURATION_RANGES.findIndex((range) => minutes <= range.max);
}

function formatMinutes(minutes) {
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`;
}

export default function PlatformAnalytics() {
  const { data, loading, error } = useAsync(() => Promise.all([
    fetchBasicAnalytics(),
    fetchCompletedServiceAnalytics(),
  ]));
  const [selection, setSelection] = useState({ key: '6m', from: null, to: null });
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => localDateInput(addDays(startOfDay(new Date()), -30)));
  const [customTo, setCustomTo] = useState(() => localDateInput(startOfDay(new Date())));
  const [customError, setCustomError] = useState('');
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [showAllShops, setShowAllShops] = useState(false);
  const [insightRange, setInsightRange] = useState(null);

  useEffect(() => {
    function handleOutside(event) {
      if (!event.target.closest('[data-range-control]')) setRangeMenuOpen(false);
    }
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setInsightsOpen(false);
        setRangeMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  if (loading) return <Skeleton height={160} />;
  if (error) return <p className={styles.error}>{error.message}</p>;

  const [stats, serviceRecords] = data;
  const records = (serviceRecords || []).filter(isCompletedRecord);
  const range = getDateRange(selection);
  const currentRecords = records.filter((record) => {
    const finishedAt = new Date(record.service_finished);
    return finishedAt >= range.start && finishedAt < range.end;
  });
  const previousRecords = records.filter((record) => {
    const finishedAt = new Date(record.service_finished);
    return finishedAt >= range.previousStart && finishedAt < range.previousEnd;
  });
  const revenue = (items) => items.reduce((total, item) => total + (Number(item.price) || 0), 0);
  const currentRevenue = revenue(currentRecords);
  const previousRevenue = revenue(previousRecords);
  const growth = percentChange(currentRevenue, previousRevenue);
  const activeShopCount = new Set(currentRecords.map((record) => record.shopId || record.shop).filter(Boolean)).size;
  const ratingCount = currentRecords.filter((record) => Number.isFinite(Number(record.rating))).length;
  const averageRating = ratingCount
    ? currentRecords.reduce((total, record) => total + (Number(record.rating) || 0), 0) / ratingCount
    : null;
  const chartValues = range.buckets.map((bucket) => revenue(currentRecords.filter((record) => {
    const finishedAt = new Date(record.service_finished);
    return finishedAt >= bucket.start && finishedAt < bucket.end;
  })));
  const chartMax = Math.max(...chartValues, 1);
  const now = new Date();
  const currentBucket = range.buckets.reduce((last, bucket, index) => bucket.start <= now ? index : last, -1);
  const shopRevenue = (items) => items.reduce((summary, record) => {
    const key = record.shopId || record.shop;
    const item = summary.get(key) || { id: key, name: record.shop, revenue: 0 };
    item.revenue += Number(record.price) || 0;
    summary.set(key, item);
    return summary;
  }, new Map());
  const currentShops = shopRevenue(currentRecords);
  const previousShops = shopRevenue(previousRecords);
  const rankings = [...currentShops.values()]
    .map((shop) => ({ ...shop, change: percentChange(shop.revenue, previousShops.get(shop.id)?.revenue || 0) }))
    .sort((left, right) => right.revenue - left.revenue);
  const displayedRankings = rankings.slice(0, showAllShops ? 8 : 4);

  function chooseRange(key) {
    if (key === 'custom') {
      setCustomOpen(true);
      return;
    }
    setSelection({ key, from: null, to: null });
    setRangeMenuOpen(false);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) {
      setCustomError('Choose both dates.');
      return;
    }
    if (customFrom > customTo) {
      setCustomError('Start date must be before end date.');
      return;
    }
    setCustomError('');
    setSelection({ key: 'custom', from: customFrom, to: customTo });
    setCustomOpen(false);
    setRangeMenuOpen(false);
  }

  function openDurationInsights() {
    setInsightRange(range);
    setInsightsOpen(true);
  }

  const insightRecords = insightRange ? (serviceRecords || []).filter((record) => {
    if (record.status !== 'completed') return false;
    const referenceDate = isValidDate(record.service_finished)
      ? new Date(record.service_finished)
      : isValidDate(record.service_started) ? new Date(record.service_started) : null;
    return referenceDate && referenceDate >= insightRange.start && referenceDate < insightRange.end;
  }) : [];
  const durations = insightRecords.map(getDuration).filter((duration) => duration !== null).sort((a, b) => a - b);
  const skippedCount = insightRecords.length - durations.length;
  const durationCounts = DURATION_RANGES.map(() => 0);
  durations.forEach((duration) => { durationCounts[bucketIndex(duration)] += 1; });
  const mostCommonIndex = durationCounts.reduce((best, count, index) => count > durationCounts[best] ? index : best, 0);
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  const averageDuration = durations.length ? totalDuration / durations.length : 0;
  const middle = Math.floor(durations.length / 2);
  const medianDuration = durations.length
    ? durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2
    : 0;

  return (
    <div className={styles.analytics}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>FLOWCUT PLATFORM</p>
          <h1>Platform performance &amp; growth</h1>
          <p className={styles.sub}>Revenue trends, shop activity, and customer satisfaction across the FlowCut network.</p>
        </div>
        <div className={styles.actions}>
          <div className={styles.rangeControl} data-range-control>
            <button className={styles.button} type="button" aria-haspopup="true" aria-expanded={rangeMenuOpen} onClick={() => setRangeMenuOpen((open) => !open)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
              {range.label}
              <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {rangeMenuOpen && (
              <div className={styles.rangeMenu}>
                {Object.entries(RANGE_LABELS).map(([key, label]) => (
                  <button className={`${styles.rangeOption} ${selection.key === key ? styles.selectedOption : ''}`} key={key} type="button" onClick={() => chooseRange(key)}>
                    {label}{selection.key === key && <span aria-hidden="true">✓</span>}
                  </button>
                ))}
                {customOpen && (
                  <div className={styles.customRange}>
                    <label>From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
                    <label>To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
                    <p className={styles.rangeError} aria-live="polite">{customError}</p>
                    <button className={`${styles.button} ${styles.primary}`} type="button" onClick={applyCustomRange}>Apply range</button>
                  </div>
                )}
              </div>
            )}
          </div>
          <button className={styles.button} type="button" onClick={openDurationInsights}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            Finish Time Insights
          </button>
        </div>
      </header>

      <section className={styles.cards} aria-label="Analytics summary">
        <article className={styles.stat}>
          <div className={styles.statTop}>Total platform revenue<span className={`${styles.icon} ${styles.greenIcon}`} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 17 6-6 4 4 8-8M15 7h6v6" /></svg></span></div>
          <strong>{formatMoney(currentRevenue)}</strong>
          <small className={growth === null ? styles.purpleText : growth >= 0 ? styles.greenText : styles.redText}>{growth === null ? 'No prior period data' : `${formatPercent(growth)} vs previous period`}</small>
        </article>
        <article className={styles.stat}>
          <div className={styles.statTop}>Growth rate<span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg></span></div>
          <strong className={growth !== null && growth < 0 ? styles.redText : styles.purpleText}>{growth === null ? '—' : formatPercent(growth)}</strong>
          <small>Compared with the prior period</small>
        </article>
        <article className={styles.stat}>
          <div className={styles.statTop}>Active shops<span className={`${styles.icon} ${styles.blueIcon}`} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9 5 4h14l1 5M4 9h16v11H4z" /><path d="M9 20v-6h6v6" /></svg></span></div>
          <strong>{activeShopCount} shop{activeShopCount === 1 ? '' : 's'}</strong>
          <small className={styles.blueText}>{currentRecords.length.toLocaleString()} completed services</small>
        </article>
        <article className={styles.stat}>
          <div className={styles.statTop}>Customer satisfaction<span className={`${styles.icon} ${styles.amberIcon}`} aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-4 3-6 7-6s7 2 7 6M16 5a3 3 0 0 1 0 6M18 14c2 .6 4 2.5 4 6" /></svg></span></div>
          <strong className={averageRating === null ? '' : styles.amberText}>{averageRating === null ? '—' : `${(averageRating / 5 * 100).toFixed(1)}%`}</strong>
          <small>{averageRating === null ? 'Ratings are not available' : `Based on ${ratingCount.toLocaleString()} post-cut ratings`}</small>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><h2>Platform revenue trend</h2><p>Gross booking value · {range.label}</p></div>
            <span className={`${styles.chip} ${growth !== null && growth < 0 ? styles.negativeChip : ''}`}>{growth === null ? 'No prior data' : `${formatPercent(growth)} growth`}</span>
          </div>
          <div className={styles.chartScroll} role="region" aria-label="Revenue chart timeline" tabIndex="0" style={{ '--bucket-count': range.buckets.length }}>
            {currentRecords.length ? (
              <div className={styles.chart} role="img" aria-label={`Platform revenue chart for ${range.label}`}>
                {range.buckets.map((bucket, index) => (
                  <div className={styles.chartColumn} key={`${bucket.label}-${bucket.start.toISOString()}`}>
                    <div className={`${styles.bar} ${index === currentBucket ? styles.currentBar : ''}`} style={{ height: `${Math.max(1, chartValues[index] / chartMax * 100)}%` }} title={`${bucket.label} · ${formatMoney(chartValues[index])}`} />
                  </div>
                ))}
              </div>
            ) : <div className={styles.empty}>No completed services in this date range.</div>}
            <div className={styles.chartLabels}>
              {range.buckets.map((bucket) => <span key={`${bucket.label}-label-${bucket.start.toISOString()}`}>{bucket.label}</span>)}
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Top network shops</h2>
            {rankings.length > 4 && <button className={styles.linkButton} type="button" onClick={() => setShowAllShops((show) => !show)}>{showAllShops ? 'Show less' : 'View league'}</button>}
          </div>
          {displayedRankings.length ? (
            <div className={styles.rankings}>
              {displayedRankings.map((shop, index) => (
                <div className={styles.ranking} key={shop.id}>
                  <span className={styles.rank}>#{index + 1}</span>
                  <div className={styles.shopInfo}><strong>{shop.name}</strong><small>{formatMoney(shop.revenue)} in period</small></div>
                  <span className={`${styles.shopGrowth} ${shop.change === null ? styles.purpleText : shop.change >= 0 ? styles.greenText : styles.redText}`}>{shop.change === null ? 'New' : formatPercent(shop.change).replace('.0%', '%')}</span>
                </div>
              ))}
            </div>
          ) : <div className={styles.empty}>No completed services in this date range.</div>}
        </article>
      </section>

      <p className={styles.note}>
        Live platform snapshot: {stats.shopsByStatus.APPROVED || 0} approved shops, {stats.shopsByStatus.PENDING || 0} pending applications, {stats.activeQueueEntries || 0} active queue entries, and {stats.usersByRole.customer || 0} customers. Revenue and duration use completed service logs; ratings are not currently stored.
      </p>

      {insightsOpen && (
        <div className={styles.modal} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInsightsOpen(false); }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="insights-title">
            <div className={styles.dialogHead}>
              <div><h2 id="insights-title">Finish Time Insights</h2><p>From service started to service finished · {insightRange?.label}</p></div>
              <button className={styles.closeButton} type="button" aria-label="Close" onClick={() => setInsightsOpen(false)}>×</button>
            </div>
            {durations.length === 0 ? (
              <div className={styles.empty}>No completed haircuts with valid start and finish times in this date range.</div>
            ) : (
              <>
                <div className={styles.featureBox}>
                  <span>Most Common Haircut Duration</span>
                  <strong>{DURATION_RANGES[mostCommonIndex].label}</strong>
                  <div className={styles.insightStats}>
                    <div><b>{durationCounts[mostCommonIndex].toLocaleString()}</b><span>Haircuts in this range</span></div>
                    <div><b>{(durationCounts[mostCommonIndex] / durations.length * 100).toFixed(1)}%</b><span>Of {durations.length.toLocaleString()} valid completed</span></div>
                    <div><b>{formatMinutes(averageDuration)}</b><span>Average duration</span></div>
                    <div><b>{formatMinutes(medianDuration)}</b><span>Median duration</span></div>
                  </div>
                </div>
                <p className={styles.insightExplanation}>Most haircuts are completed within {DURATION_RANGES[mostCommonIndex].label} based on completed service records.</p>
                <div className={styles.breakdown}>
                  <h3>Duration breakdown</h3>
                  {DURATION_RANGES.map((durationRange, index) => (
                    <div className={`${styles.durationRow} ${index === mostCommonIndex ? styles.topDuration : ''}`} key={durationRange.label}>
                      <span>{durationRange.label.replace(' minutes', ' min')}</span>
                      <div className={styles.track}><i style={{ width: `${durationCounts[mostCommonIndex] ? durationCounts[index] / durationCounts[mostCommonIndex] * 100 : 0}%` }} /></div>
                      <span>{(durationCounts[index] / durations.length * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                {skippedCount > 0 && <p className={styles.skipped}>{skippedCount.toLocaleString()} completed record{skippedCount === 1 ? '' : 's'} ignored (missing or invalid start/finish time).</p>}
              </>
            )}
            <div className={styles.dialogActions}><button className={styles.button} type="button" onClick={() => setInsightsOpen(false)}>Close</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
