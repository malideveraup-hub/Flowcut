import { useState } from 'react';
import { fetchPlatformAnalytics } from '../../api/adminApi';
import Skeleton from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import styles from './PlatformAnalytics.module.css';

const DAY_MS = 86400000;
const DURATION_LABELS = ['0–20 min', '21–30 min', '31–40 min', '41–50 min', '51–60 min', '60+ min'];
const PRESETS = [
  ['7d', 'Last 7 days', 7],
  ['30d', 'Last 30 days', 30],
  ['6m', 'Last 6 months', 183],
  ['12m', 'Last 12 months', 365],
];

function dayValue(date) { return date.toISOString().slice(0, 10); }
function presetRange(days) {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  return { from: dayValue(from), to: dayValue(to) };
}
function formatMoney(value) { return `₱${Math.round(value || 0).toLocaleString('en-PH')}`; }
function formatMinutes(value) { return Number.isFinite(value) ? `${Math.round(value)} min` : 'N/A'; }
function percentChange(current, previous) { return previous > 0 ? ((current - previous) / previous) * 100 : null; }
function formatChange(value) { return value == null ? 'No prior period data' : `${value > 0 ? '+' : ''}${value.toFixed(1)}% vs previous period`; }

function groupDaily(daily, range) {
  const start = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(`${range.to}T00:00:00Z`);
  const isLong = (end - start) > 45 * DAY_MS;
  const buckets = new Map();
  daily.forEach((day) => {
    const date = new Date(`${day.date}T00:00:00Z`);
    const key = isLong ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` : day.date;
    const label = isLong ? date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) : date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
    const current = buckets.get(key) || { key, label, joined: 0, completed: 0, cancelled: 0, waitTotal: 0, waitCount: 0, revenue: 0 };
    current.joined += day.joined;
    current.completed += day.completed;
    current.cancelled += day.cancelled;
    current.revenue += day.revenue;
    current.waitTotal += (day.averageWaitMinutes || 0) * day.waitSampleCount;
    current.waitCount += day.waitSampleCount;
    buckets.set(key, current);
  });
  return [...buckets.values()].map((bucket) => ({ ...bucket, averageWaitMinutes: bucket.waitCount ? bucket.waitTotal / bucket.waitCount : null }));
}

function ActivityChart({ rows }) {
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.joined, row.completed, row.cancelled]));
  if (!rows.some((row) => row.joined || row.completed || row.cancelled)) return <p className={styles.empty}>No queue activity in this period.</p>;
  return <div className={styles.activityRows}>
    <div className={styles.legend}><span>Joined</span><span>Completed</span><span>Cancelled</span></div>
    {rows.map((row) => <div className={styles.activityRow} key={row.key} title={`${row.label}: ${row.joined} joined, ${row.completed} completed, ${row.cancelled} cancelled`}>
      <span>{row.label}</span><div className={styles.activityBars}>
        {[['joined', 'joinedBar'], ['completed', 'completedBar'], ['cancelled', 'cancelledBar']].map(([key, className]) => <i key={key} className={styles[className]} style={{ width: `${Math.max(row[key] ? 3 : 0, row[key] / maximum * 100)}%` }} />)}
      </div><strong>{row.joined}/{row.completed}/{row.cancelled}</strong>
    </div>)}
  </div>;
}

export default function PlatformAnalytics() {
  const [range, setRange] = useState(() => ({ key: '30d', ...presetRange(30) }));
  const [draft, setDraft] = useState(() => ({ from: range.from, to: range.to }));
  const [rangeError, setRangeError] = useState('');
  const [showAllShops, setShowAllShops] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { data, loading, error, refetch } = useAsync(
    () => fetchPlatformAnalytics({ from: range.from, to: range.to }),
    [range.from, range.to],
  );

  function choosePreset(key, days) {
    const next = presetRange(days);
    setDraft(next);
    setRange({ key, ...next });
    setRangeError('');
  }
  function applyCustom(event) {
    event.preventDefault();
    if (!draft.from || !draft.to || draft.from > draft.to) {
      setRangeError('Choose a valid start and end date.');
      return;
    }
    const days = (Date.parse(`${draft.to}T00:00:00Z`) - Date.parse(`${draft.from}T00:00:00Z`)) / DAY_MS + 1;
    if (days > 366) { setRangeError('Choose a range of 366 days or fewer.'); return; }
    setRange({ key: 'custom', ...draft });
    setRangeError('');
  }

  if (loading) return <div className={styles.analytics}><Skeleton height={36} /><Skeleton height={110} /><Skeleton height={260} /></div>;
  if (error) return <div className={styles.analytics}><p className={styles.error}>{error.message}</p><button className={styles.button} type="button" onClick={refetch}>Try again</button></div>;

  const current = data.current;
  const previous = data.previous;
  const change = percentChange(current.revenue, previous.revenue);
  const rows = groupDaily(current.daily, range);
  const rankings = data.shopRankings || [];
  const displayed = rankings.slice(0, showAllShops ? 12 : 5);
  const maxService = Math.max(1, ...(data.serviceTotals || []).map((service) => service.completedCount));
  const totalUsers = Object.values(data.stats.usersByRole || {}).reduce((sum, value) => sum + value, 0);
  const durationTotal = current.durationSampleCount || 0;

  return <main className={styles.analytics}>
    <header className={styles.head}>
      <div><p className={styles.eyebrow}>FLOWCUT PLATFORM</p><h1>Platform analytics</h1><p className={styles.sub}>Platform operations and current-price revenue estimates for {range.from} through {range.to} (UTC).</p></div>
      <div className={styles.actions}>
        {PRESETS.map(([key, label, days]) => <button key={key} className={`${styles.button} ${range.key === key ? styles.primary : ''}`} type="button" onClick={() => choosePreset(key, days)}>{label}</button>)}
      </div>
    </header>

    <form className={styles.rangeForm} onSubmit={applyCustom}>
      <label>From<input type="date" value={draft.from} onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))} /></label>
      <label>To<input type="date" value={draft.to} onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))} /></label>
      <button className={`${styles.button} ${styles.primary}`} type="submit">Apply custom range</button>
      {rangeError && <span role="alert">{rangeError}</span>}
    </form>

    <section className={styles.cards} aria-label="Platform summary">
      <article className={styles.stat}><div className={styles.statTop}>Total registered shops</div><strong>{data.stats.totalRegisteredShops.toLocaleString()}</strong><small>{Object.entries(data.stats.shopsByStatus).map(([status, count]) => `${status.toLowerCase()}: ${count}`).join(' · ') || 'No shop records'}</small></article>
      <article className={styles.stat}><div className={styles.statTop}>Active shops</div><strong>{current.activeShopCount.toLocaleString()}</strong><small>At least one completed service log in this period</small></article>
      <article className={styles.stat}><div className={styles.statTop}>Completed services</div><strong>{current.completedServiceCount.toLocaleString()}</strong><small>{current.completedVisitCount.toLocaleString()} completed queue visits</small></article>
      <article className={styles.stat}><div className={styles.statTop}>Revenue estimate</div><strong>{formatMoney(current.revenue)}</strong><small>Current catalog prices · {formatChange(change)}</small></article>
      <article className={styles.stat}><div className={styles.statTop}>Average actual wait</div><strong>{formatMinutes(current.averageWaitMinutes)}</strong><small>{current.waitSampleCount} valid service-start samples</small></article>
      <article className={styles.stat}><div className={styles.statTop}>Valid service duration</div><strong>{formatMinutes(current.averageDurationMinutes)}</strong><small>{durationTotal} valid; {current.durationExcludedCount} excluded</small></article>
    </section>

    <section className={styles.grid}>
      <article className={styles.panel}><div className={styles.panelHead}><div><h2>Queue visits and platform usage</h2><p>Join timestamps and final stored statuses by {rows.length > 45 ? 'month' : 'day'}</p></div></div><ActivityChart rows={rows} /></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><h2>Actual waiting-time trend</h2><p>Queue creation to service start; daily values use valid samples</p></div></div>
        {rows.some((row) => row.averageWaitMinutes != null) ? <div className={styles.waitRows}>{rows.map((row) => row.averageWaitMinutes == null ? null : <div key={row.key} title={`${row.label}: ${formatMinutes(row.averageWaitMinutes)} from ${row.waitCount} samples`}><span>{row.label}</span><strong>{formatMinutes(row.averageWaitMinutes)}</strong><small>{row.waitCount} samples</small></div>)}</div> : <p className={styles.empty}>No valid actual-wait records in this period.</p>}
      </article>
    </section>

    <section className={styles.grid}>
      <article className={styles.panel}><div className={styles.panelHead}><div><h2>Shop activity</h2><p>{displayed.length ? `${rankings.length} active shops ranked by completed service revenue` : 'Active shops require at least one valid completed service log.'}</p></div>{rankings.length > 5 && <button type="button" className={styles.linkButton} onClick={() => setShowAllShops((value) => !value)}>{showAllShops ? 'Show less' : 'Show more'}</button>}</div>
        {displayed.length ? <div className={styles.rankings}>{displayed.map((shop, index) => { const shopChange = percentChange(shop.revenue, shop.previousRevenue); return <div className={styles.ranking} key={shop.shopId}><span className={styles.rank}>#{index + 1}</span><div className={styles.shopInfo}><strong>{shop.shopName}</strong><small>{formatMoney(shop.revenue)} · {shop.completedServiceCount} services</small></div><span className={styles.shopGrowth}>{formatChange(shopChange)}</span></div>; })}</div> : <p className={styles.empty}>No active shops in this period.</p>}
      </article>
      <article className={styles.panel}><div className={styles.panelHead}><div><h2>Services across shops</h2><p>Completed service logs · revenue estimated from current service prices</p></div></div>
        {data.serviceTotals.length ? <div className={styles.serviceRows}>{data.serviceTotals.slice(0, 8).map((service) => <div key={service.serviceName} title={`${service.serviceName}: ${service.completedCount} completed; ${formatMoney(service.revenue)}`}><span>{service.serviceName}</span><i><b style={{ width: `${service.completedCount / maxService * 100}%` }} /></i><strong>{service.completedCount}</strong><small>{formatMoney(service.revenue)}</small></div>)}</div> : <p className={styles.empty}>No completed service records in this period.</p>}
      </article>
    </section>

    <section className={styles.panel}><div className={styles.panelHead}><div><h2>Duration distribution</h2><p>Actual duration or validated saved duration · {current.durationSampleCount} valid records</p></div><button className={styles.linkButton} type="button" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? 'Hide details' : 'Show details'}</button></div>
      {detailsOpen && (durationTotal ? <div className={styles.durationRows}>{DURATION_LABELS.map((label, index) => <div key={label}><span>{label}</span><i><b style={{ width: `${(current.durationCounts[index] || 0) / durationTotal * 100}%` }} /></i><strong>{current.durationCounts[index] || 0}</strong><small>{((current.durationCounts[index] || 0) / durationTotal * 100).toFixed(1)}%</small></div>)}</div> : <p className={styles.empty}>No valid service-duration samples in this period.</p>)}
    </section>

    <p className={styles.note}>Current platform snapshot: {data.stats.activeQueueEntries} active queue entries across {totalUsers.toLocaleString()} registered users. Queue status history is not stored; completions and cancellations are grouped by the queue entry’s final status timestamp, so a visit that changed status more than once cannot be reconstructed historically. Active shop means at least one completed service log in the selected UTC period. Ratings recorded in this period: {data.ratings.count}{data.ratings.average == null ? '' : ` (average ${Number(data.ratings.average).toFixed(1)} / 5)`}.</p>
    <p className={styles.note}>Revenue is an estimate using current catalog prices; historical service prices are not stored.</p>
  </main>;
}
