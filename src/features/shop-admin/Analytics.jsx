import { useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchOwnShop, fetchOwnShopAnalytics } from '../../api/shopAdminApi';
import { getAiInsights, askAi } from '../../api/aiAnalytics';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Analytics.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SERVICE_COLORS = ['#6b4bff', '#e8a53a', '#12a36b', '#2f6bff', '#d64545', '#9d72db', '#36a6a0'];
const PAGE_SIZE = 5;

function dateValue(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function money(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function hourLabel(hour) {
  const shownHour = hour % 12 || 12;
  return `${shownHour}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

function getHourlySummary(records) {
  const hours = Array.from({ length: 12 }, (_, index) => index + 9);
  const counts = hours.map((hour) => records.filter((record) => dateValue(record.startedAt)?.getHours() === hour).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const busiestIndex = total ? counts.indexOf(Math.max(...counts)) : -1;
  const quietestIndex = total ? counts.indexOf(Math.min(...counts)) : -1;
  const rangeLabel = (index) => index < 0
    ? 'N/A'
    : `${hourLabel(hours[index])} – ${hourLabel(hours[index] + 1)}`;

  return {
    hours,
    counts,
    busiestIndex,
    quietestIndex,
    busiestHour: rangeLabel(busiestIndex),
    busiestCount: busiestIndex < 0 ? 0 : counts[busiestIndex],
    quietestHour: rangeLabel(quietestIndex),
    quietestCount: quietestIndex < 0 ? 0 : counts[quietestIndex],
    hourlyBreakdown: Object.fromEntries(hours.map((hour, index) => [hourLabel(hour), counts[index]])),
  };
}

function isThisMonth(value, now) {
  const date = dateValue(value);
  return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function Icon({ kind, size = 18 }) {
  const paths = {
    revenue: <><path d="M4 17 9 12l3 3 7-8" /><path d="M14 7h5v5" /></>,
    people: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-4 3-6 7-6s7 2 7 6M16 5a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.5 4 6" /></>,
    wait: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    repeat: <><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 9A8 8 0 0 0 6.4 6.4L4 10m0 5a8 8 0 0 0 13.6 2.6L20 14" /></>,
    sparkle: <><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" /></>,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

function StatCard({ title, value, detail, icon, tone = 'purple' }) {
  return (
    <article className={`${styles.card} ${styles.stat}`}>
      <div className={styles.statTop}>
        <span>{title}</span>
        <span className={`${styles.icon} ${styles[tone]}`}><Icon kind={icon} /></span>
      </div>
      <strong className={styles.statValue}>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function getRevenue(records) {
  return records
    .filter((record) => Number.isFinite(record.price))
    .reduce((sum, record) => sum + record.price, 0);
}

function getWaitMinutes(record) {
  const joined = dateValue(record.joinedAt);
  const started = dateValue(record.startedAt);
  if (!joined || !started) return null;
  return Math.max(0, Math.round((started.getTime() - joined.getTime()) / 60000));
}

function TrendChart({ records }) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const monthRecords = records.filter((record) => {
      const finished = dateValue(record.finishedAt);
      return finished && finished.getFullYear() === date.getFullYear() && finished.getMonth() === date.getMonth();
    });
    return {
      key,
      label: MONTHS[date.getMonth()],
      revenue: getRevenue(monthRecords),
      count: monthRecords.length,
      current: index === 5,
    };
  });

  const maxRevenue = Math.max(...months.map((item) => item.revenue), 100);
  const points = months.map((item, index) => {
    const x = 32 + (index * 96);
    const y = 140 - ((item.revenue / maxRevenue) * 110);
    return { ...item, x, y };
  });

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className={styles.chartWrap}>
      <svg viewBox="0 0 544 180" className={styles.chart} role="img" aria-label="Monthly revenue trend line chart">
        <line x1="32" y1="30" x2="512" y2="30" stroke="#f0eff7" strokeDasharray="4 4" />
        <line x1="32" y1="85" x2="512" y2="85" stroke="#f0eff7" strokeDasharray="4 4" />
        <line x1="32" y1="140" x2="512" y2="140" stroke="#e7e6f0" />
        <path d={path} fill="none" stroke="#6b4bff" strokeWidth="2.5" />
        {points.map((point) => (
          <g key={point.key}>
            <circle cx={point.x} cy={point.y} r="4" fill="#6b4bff" />
            <text x={point.x} y="162" textAnchor="middle" className={styles.monthLabel}>{point.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ServiceDonut({ records }) {
  const tally = new Map();
  records.forEach((record) => tally.set(record.serviceName, (tally.get(record.serviceName) || 0) + 1));
  const services = [...tally.entries()]
    .map(([name, count], index) => ({ name, count, color: SERVICE_COLORS[index % SERVICE_COLORS.length] }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const total = records.length;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const segments = services.map((service, index) => {
    const length = total ? (service.count / total) * circumference : 0;
    const offset = services.slice(0, index).reduce((sum, previous) => sum + (total ? (previous.count / total) * circumference : 0), 0);
    return { ...service, length, offset };
  });

  return (
    <div className={styles.donutWrap}>
      <div className={styles.donut}>
        <svg viewBox="0 0 150 150" role="img" aria-label="Share of this month's completed services by service name">
          <circle cx="75" cy="75" r={radius} fill="none" stroke="#f0eff7" strokeWidth="22" />
          {segments.map((segment) => (
            <circle
              key={segment.name}
              cx="75"
              cy="75"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="22"
              strokeDasharray={`${segment.length} ${circumference - segment.length}`}
              strokeDashoffset={-segment.offset}
            />
          ))}
        </svg>
        <div className={styles.donutCenter}><strong>{total.toLocaleString()}</strong><span>services</span></div>
      </div>
      {services.length ? (
        <ul className={styles.legend}>
          {services.map((service) => (
            <li key={service.name}><i style={{ background: service.color }} /><span>{service.name}</span><small>{Math.round((service.count / total) * 100)}%</small></li>
          ))}
        </ul>
      ) : <p className={styles.noData}>No completed services this month.</p>}
    </div>
  );
}

function BarberTable({ records, barbers, selectedBarber }) {
  const rows = barbers.map((barber) => {
    const barberRecords = records.filter((record) => record.barberId === barber.id);
    const durations = barberRecords
      .map((r) => r.durationMinutes)
      .filter((d) => Number.isFinite(d))
      .sort((a, b) => a - b);
    const count = durations.length;
    const mid = Math.floor(count / 2);
    const median = count ? (count % 2 !== 0 ? durations[mid] : Math.round((durations[mid - 1] + durations[mid]) / 2)) : null;
    const cleaned = durations.filter((d) => d >= 3 && d <= 180);
    const cleanedAvg = cleaned.length ? Math.round(cleaned.reduce((a, b) => a + b, 0) / cleaned.length) : median;
    const pricedRecords = barberRecords.filter((record) => Number.isFinite(record.price));
    const hasOutlier = durations.some((d) => d > 180);

    return {
      ...barber,
      count: barberRecords.length,
      averageDuration: cleanedAvg,
      medianDuration: median,
      hasOutlier,
      revenue: getRevenue(barberRecords),
      priceCount: pricedRecords.length,
      missingPrices: barberRecords.some((record) => !Number.isFinite(record.price)),
    };
  }).sort((left, right) => right.revenue - left.revenue || right.count - left.count || left.name.localeCompare(right.name));

  return (
    <div className={styles.tableScroller}>
      <table className={`${styles.table} ${styles.barberTable}`}>
        <thead><tr><th>Barber name</th><th>Completed</th><th>Avg service time (Cleaned)</th><th>Listed value</th><th>Satisfaction</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr className={selectedBarber === row.id ? styles.selectedRow : ''} key={row.id}>
              <th scope="row">{row.name}</th>
              <td data-label="Completed" className={styles.mono}>{row.count} services</td>
              <td data-label="Avg service time" className={styles.mono}>
                {row.medianDuration == null ? '—' : `${row.medianDuration} mins (median)`}
                {row.hasOutlier && <span className={styles.badgeOutlier} title="Extreme outlier (>3h) excluded from average">Outlier filtered</span>}
              </td>
              <td data-label="Listed value" className={`${styles.mono} ${styles.revenue}`}>{row.priceCount ? `${money(row.revenue)}${row.missingPrices ? '*' : ''}` : '—'}</td>
              <td data-label="Satisfaction"><span className={styles.unavailable} title="FlowCut does not collect barber-specific ratings yet">Not available</span></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="5" className={styles.emptyCell}>No barbers are listed for this shop.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function BusiestHours({ records }) {
  const { hours, counts, busiestIndex, quietestIndex } = getHourlySummary(records);
  const maxCount = Math.max(...counts, 0);

  return (
    <div className={styles.hours}>
      <div className={styles.bars} role="img" aria-label="Completed services started by hour, from 9 AM to 8 PM">
        {hours.map((hour, index) => (
          <div className={styles.barColumn} key={hour}>
            <div className={`${styles.bar} ${index === busiestIndex ? styles.peak : ''}`} style={{ height: `${maxCount ? Math.max(3, (counts[index] / maxCount) * 100) : 3}%` }} title={`${hourLabel(hour)}: ${counts[index]} services`} />
            <span>{hour <= 12 ? hour : hour - 12}{hour < 12 ? 'a' : 'p'}</span>
          </div>
        ))}
      </div>
      <div className={styles.insights}>
        <div><small>Busiest hour</small><strong>{busiestIndex < 0 ? '—' : `${hourLabel(hours[busiestIndex])} – ${hourLabel(hours[busiestIndex] + 1)}`}</strong><span>{busiestIndex < 0 ? 'No service data this month' : `${counts[busiestIndex]} services started`}</span></div>
        <div><small>Quietest hour</small><strong>{quietestIndex < 0 ? '—' : `${hourLabel(hours[quietestIndex])} – ${hourLabel(hours[quietestIndex] + 1)}`}</strong><span>{quietestIndex < 0 ? 'No service data this month' : `${counts[quietestIndex]} services started`}</span></div>
      </div>
    </div>
  );
}

function getServiceDurationStats(records) {
  const byService = new Map();
  records.forEach((record) => {
    if (!record.serviceName) return;
    const entry = byService.get(record.serviceName) || { name: record.serviceName, total: 0, durations: [] };
    entry.total += 1;
    const minutes = Number.isFinite(record.durationMinutes) ? record.durationMinutes : null;
    if (minutes != null) {
      entry.durations.push(minutes);
    }
    byService.set(record.serviceName, entry);
  });

  return [...byService.values()].map((entry) => {
    const rawDurations = [...entry.durations].sort((a, b) => a - b);
    const count = rawDurations.length;
    if (!count) {
      return {
        name: entry.name,
        count: entry.total,
        median: null,
        cleanedMean: null,
        rawMean: null,
        p80: null,
        outlierCount: 0,
        pctFast: 0,
        pctStandard: 0,
        pctExtended: 0,
        suggestedEstimate: null,
      };
    }

    const mid = Math.floor(count / 2);
    const median = count % 2 !== 0 ? rawDurations[mid] : Math.round((rawDurations[mid - 1] + rawDurations[mid]) / 2);
    const cleaned = rawDurations.filter((d) => d >= 3 && d <= 180);
    const outlierCount = count - cleaned.length;
    const cleanedMean = cleaned.length ? Math.round(cleaned.reduce((sum, d) => sum + d, 0) / cleaned.length) : median;
    const rawMean = Math.round(rawDurations.reduce((sum, d) => sum + d, 0) / count);
    const p80 = rawDurations[Math.min(count - 1, Math.floor(count * 0.8))];

    const pctFast = Math.round((cleaned.filter((d) => d < 20).length / (cleaned.length || 1)) * 100);
    const pctStandard = Math.round((cleaned.filter((d) => d >= 20 && d <= 35).length / (cleaned.length || 1)) * 100);
    const pctExtended = Math.round((cleaned.filter((d) => d > 35).length / (cleaned.length || 1)) * 100);
    const suggestedEstimate = Math.max(10, Math.round(median / 5) * 5);

    return {
      name: entry.name,
      count: entry.total,
      median,
      cleanedMean,
      rawMean,
      p80,
      outlierCount,
      pctFast,
      pctStandard,
      pctExtended,
      suggestedEstimate,
    };
  });
}

function CompletionTable({ records, selectedBarber }) {
  const [sort, setSort] = useState('count');
  const [page, setPage] = useState(1);
  const comparators = {
    medianDesc: (left, right) => (right.median ?? -1) - (left.median ?? -1) || right.count - left.count,
    medianAsc: (left, right) => (left.median ?? 999) - (right.median ?? 999) || right.count - left.count,
    count: (left, right) => right.count - left.count || left.name.localeCompare(right.name),
    name: (left, right) => left.name.localeCompare(right.name),
  };
  const filteredRecords = records.filter((record) => selectedBarber === 'all' || record.barberId === selectedBarber);
  const rows = getServiceDurationStats(filteredRecords).sort(comparators[sort] || comparators.count);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeSort(event) {
    setSort(event.target.value);
    setPage(1);
  }

  return (
    <>
      <div className={styles.tools}>
        <label className={styles.sortControl}>
          <span>Sort by</span>
          <select value={sort} onChange={changeSort}>
            <option value="count">Most popular (Count ↓)</option>
            <option value="medianDesc">Longest median duration ↓</option>
            <option value="medianAsc">Shortest median duration ↑</option>
            <option value="name">Service Name (A–Z)</option>
          </select>
        </label>
        <div className={styles.pager} aria-label="Haircut completion pages">
          <button type="button" className={styles.pageButton} disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹ Prev</button>
          <span className={styles.pageLabel}>Page {currentPage} of {pages}</span>
          <button type="button" className={styles.pageButton} disabled={currentPage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next ›</button>
        </div>
      </div>
      <div className={styles.tableScroller}>
        <table className={`${styles.table} ${styles.timesTable}`}>
          <thead>
            <tr>
              <th>Service</th>
              <th>Median (Real)</th>
              <th>Cleaned Mean</th>
              <th>80% Finish Under</th>
              <th>Distribution</th>
              <th>Completed</th>
              <th>Recommended Estimate</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td data-label="Median (Real)" className={styles.mono}>
                  <strong>{row.median == null ? '—' : `${row.median} min`}</strong>
                </td>
                <td data-label="Cleaned Mean" className={styles.mono}>
                  {row.cleanedMean == null ? '—' : `${row.cleanedMean} min`}
                </td>
                <td data-label="80% Finish Under" className={styles.mono}>
                  {row.p80 == null ? '—' : `${row.p80} min`}
                </td>
                <td data-label="Distribution">
                  <div className={styles.distBar} title={`${row.pctFast}% Fast (<20m), ${row.pctStandard}% Normal (20-35m), ${row.pctExtended}% Long (>35m)`}>
                    <div className={styles.distFast} style={{ width: `${row.pctFast}%` }} />
                    <div className={styles.distStd} style={{ width: `${row.pctStandard}%` }} />
                    <div className={styles.distExt} style={{ width: `${row.pctExtended}%` }} />
                  </div>
                </td>
                <td data-label="Completed" className={styles.mono}>
                  {row.count}
                  {row.outlierCount > 0 && <span className={styles.badgeOutlier} title={`${row.outlierCount} ticket(s) took >3h (e.g. left open) and were excluded from median`}>{row.outlierCount} outlier</span>}
                </td>
                <td data-label="Recommended Estimate">
                  {row.suggestedEstimate ? (
                    <span className={styles.badgeRecommend} title="Recommended queue slot duration to prevent queue drift">
                      {row.suggestedEstimate} min
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan="7" className={styles.emptyCell}>No completed services recorded in the last six months.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className={styles.foot}>
        Based on completed services with recorded start and finish times. <strong>Median (Real)</strong> is the middle duration and is immune to tickets accidentally left open overnight. <strong>80% Finish Under</strong> gives the safe customer expectation buffer.
      </p>
    </>
  );
}

function AiInsightsSection({
  shopName,
  customersServed,
  revenue,
  pricedCount,
  avgWait,
  returnRate,
  returningCount,
  serviceStats,
  barberStats,
  busiestHour,
  busiestCount,
  quietestHour,
  quietestCount,
  hourlyBreakdown,
}) {
  const [aiData, setAiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState(null);

  async function loadInsights() {
    setLoading(true);
    try {
      const data = await getAiInsights({
        shopName,
        customersServed,
        revenue,
        pricedCount,
        avgWait,
        returnRate,
        returningCount,
        serviceStats,
        barberStats,
        busiestHour,
        busiestCount,
        quietestHour,
        quietestCount,
        hourlyBreakdown,
      });
      setAiData(data);
    } catch (err) {
      console.warn('[ai] Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    getAiInsights({
      shopName,
      customersServed,
      revenue,
      pricedCount,
      avgWait,
      returnRate,
      returningCount,
      serviceStats,
      barberStats,
      busiestHour,
      busiestCount,
      quietestHour,
      quietestCount,
      hourlyBreakdown,
    }).then((data) => {
      if (active) setAiData(data);
    }).catch((err) => {
      console.warn('[ai] Failed to load insights:', err);
    });

    return () => { active = false; };
  }, [customersServed, shopName, revenue, pricedCount, avgWait, returnRate, returningCount, serviceStats, barberStats, busiestHour, busiestCount, quietestHour, quietestCount, hourlyBreakdown]);

  async function handleAsk(queryText) {
    const q = queryText || question;
    if (!q || !q.trim()) return;
    setAsking(true);
    setAiAnswer(null);
    try {
      const answer = await askAi(q, {
        shopName,
        customersServed,
        avgWait,
        returnRate,
        serviceStats,
        barberStats,
        busiestHour,
        busiestCount,
        quietestHour,
        quietestCount,
        hourlyBreakdown,
      });
      setAiAnswer(answer);
    } catch (err) {
      setAiAnswer(`Unable to answer: ${err.message}`);
    } finally {
      setAsking(false);
    }
  }

  return (
    <article className={`${styles.card} ${styles.aiCard}`}>
      <div className={styles.aiHeader}>
        <div className={styles.aiTitleWrap}>
          <h2>FlowCut AI Insights &amp; Queue Tuning</h2>
          <span className={styles.aiBadge}>
            <Icon kind="sparkle" /> Gemini AI
          </span>
        </div>
        <button
          type="button"
          className={styles.aiRefreshBtn}
          onClick={loadInsights}
          disabled={loading}
          title="Re-run statistical analysis with Gemini"
        >
          {loading ? 'Analyzing...' : '🔄 Refresh AI Analysis'}
        </button>
      </div>

      <div className={styles.aiGrid}>
        <div className={styles.aiRecCard}>
          <div className={styles.aiRecTop}>
            <span className={`${styles.aiRecPill} ${styles.revenue}`}>Revenue Insights</span>
          </div>
          <h3>1. AI Revenue Insights</h3>
          <p>
            {loading
              ? 'Analyzing monthly earnings and service volume trends...'
              : aiData?.revenueInsights ||
                'Revenue insights will appear after the monthly service data is analyzed.'}
          </p>
        </div>

        <div className={styles.aiRecCard}>
          <div className={styles.aiRecTop}>
            <span className={`${styles.aiRecPill} ${styles.staffing}`}>Busy-Hour Advice</span>
          </div>
          <h3>2. AI Busy-Hour Recommendations</h3>
          <p>
            {loading
              ? 'Evaluating customer counts by hour...'
              : aiData?.busyHourRecommendations ||
                'AI traffic recommendations will appear after the monthly service data is analyzed.'}
          </p>
        </div>

        <div className={styles.aiRecCard}>
          <div className={styles.aiRecTop}>
            <span className={`${styles.aiRecPill} ${styles.accuracy}`}>Service &amp; Staff</span>
          </div>
          <h3>3. AI Service &amp; Barber Insights</h3>
          <p>
            {loading
              ? 'Summarizing service popularity and barber completion times...'
              : aiData?.serviceBarberInsights ||
                'Service popularity and barber workload insights will appear after the service data is analyzed.'}
          </p>
        </div>
      </div>

      <div className={styles.askAiBox}>
        <div className={styles.askAiHeader}>
          <Icon kind="sparkle" size={16} />
          <span>4. Ask FlowCut AI:</span>
        </div>
        <form
          className={styles.askAiForm}
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(question);
          }}
        >
          <input
            type="text"
            className={styles.askAiInput}
            maxLength={500}
            placeholder="Ask anything about your shop analytics (e.g., Which haircut was most popular?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className={styles.askAiSubmit} disabled={asking || !question.trim()}>
            {asking ? 'Thinking...' : 'Ask AI'}
          </button>
        </form>

        <div className={styles.quickChips}>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => {
              setQuestion('Which haircut was most popular this month?');
              handleAsk('Which haircut was most popular this month?');
            }}
          >
            Which haircut was most popular this month?
          </button>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => {
              setQuestion('What was our busiest hour this month?');
              handleAsk('What was our busiest hour this month?');
            }}
          >
            What was our busiest hour?
          </button>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => {
              setQuestion('How can we balance our barber workload?');
              handleAsk('How can we balance our barber workload?');
            }}
          >
            How to balance barber workload?
          </button>
          <button
            type="button"
            className={styles.chipBtn}
            onClick={() => {
              setQuestion('Why is median duration more accurate than average for our queue?');
              handleAsk('Why is median duration more accurate than average for our queue?');
            }}
          >
            Why is median better than average?
          </button>
        </div>

        {aiAnswer && (
          <div className={styles.aiResponseBubble}>
            <strong>FlowCut AI:</strong> {aiAnswer}
          </div>
        )}
      </div>
    </article>
  );
}

export default function Analytics() {
  const { data: shop, loading: shopLoading, error: shopError } = useAsync(fetchOwnShop);
  const { data: analytics, loading: analyticsLoading, error: analyticsError, refetch } = useAsync(fetchOwnShopAnalytics);
  const [selectedBarber, setSelectedBarber] = useState('all');
  const shopName = shop?.name || 'Your shop';
  const shopLocation = shop?.address?.split(',').at(-1)?.trim();
  const barbers = analytics?.barbers || [];
  const records = analytics?.records || [];
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const recentRecords = records.filter((record) => {
    const finished = dateValue(record.finishedAt);
    return finished && finished >= windowStart && finished <= now;
  });
  const filteredRecords = recentRecords.filter((record) => selectedBarber === 'all' || record.barberId === selectedBarber);
  const monthRecords = filteredRecords.filter((record) => isThisMonth(record.finishedAt, now));
  const allMonthRecords = recentRecords.filter((record) => isThisMonth(record.finishedAt, now));
  const priceRecords = monthRecords.filter((record) => Number.isFinite(record.price));
  const waitRecords = monthRecords.map((record) => getWaitMinutes(record)).filter((wait) => wait != null);
  const knownCustomers = monthRecords.filter((record) => record.returning !== null);
  const hourlySummary = getHourlySummary(monthRecords);
  const returningCount = knownCustomers.filter((record) => record.returning).length;
  const missingPrices = monthRecords.length - priceRecords.length;
  const revenueDetail = !monthRecords.length
    ? 'No completed services this month'
    : missingPrices
    ? `${priceRecords.length} of ${monthRecords.length} services have a saved listed price`
    : 'Listed service prices at start · payments are not recorded';
  const currentRevenue = !monthRecords.length
    ? money(0)
    : priceRecords.length
      ? `${money(getRevenue(priceRecords))}${missingPrices ? '*' : ''}`
      : '—';
  const avgWait = waitRecords.length ? `${Math.round(waitRecords.reduce((total, wait) => total + wait, 0) / waitRecords.length)} min` : '—';
  const retention = knownCustomers.length ? `${Math.round((returningCount / knownCustomers.length) * 100)}%` : '—';
  const retentionDetail = knownCustomers.length
    ? `${returningCount} repeat visits among account customers`
    : 'Returning visits unavailable for walk-ins';
  const shopLabel = [shopName, shopLocation].filter(Boolean).join(' · ').toUpperCase();
  const isLoading = shopLoading || analyticsLoading;

  // Prepare statistical summary for AI
  const serviceStats = getServiceDurationStats(recentRecords);
  const barberStats = barbers.map((b) => {
    const bRecords = allMonthRecords.filter((r) => r.barberId === b.id);
    const bDurations = bRecords.map((r) => r.durationMinutes).filter((d) => Number.isFinite(d));
    return {
      id: b.id,
      name: b.name,
      count: bRecords.length,
      avgDuration: bDurations.length ? Math.round(bDurations.reduce((a, b) => a + b, 0) / bDurations.length) : null,
    };
  });

  if (isLoading) {
    return <div className={styles.loading}><Skeleton height={28} width={260} /><Skeleton height={156} /><Skeleton height={300} /></div>;
  }

  if (shopError) return <EmptyState title="Shop analytics unavailable" body={shopError.message || 'Shop information could not be loaded.'} />;

  if (analyticsError) {
    return (
      <div className={styles.analytics}>
        <EmptyState title="Analytics could not be loaded" body={analyticsError.message || 'Try loading the shop reports again.'} actionLabel="Try again" onAction={() => refetch()} />
      </div>
    );
  }

  return (
    <div className={styles.analytics}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{shopLabel}</p>
          <h1>Performance &amp; Analytics</h1>
          <p className={styles.sub}>Review monthly listed service value, service popularity, and wait-time statistics.</p>
        </div>
        <label className={styles.filter}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8.5 8.5 11.5 11.5M8.5 15.5 20 4" /></svg>
          <span>Barber</span>
          <select value={selectedBarber} onChange={(event) => setSelectedBarber(event.target.value)}>
            <option value="all">All barbers</option>
            {barbers.map((barber) => <option value={barber.id} key={barber.id}>{barber.name}</option>)}
          </select>
        </label>
      </header>

      <section className={styles.stats} aria-label="Key figures">
        <StatCard title="Listed service value" value={currentRevenue} detail={revenueDetail} icon="revenue" tone="green" />
        <StatCard title="Customers served" value={monthRecords.length.toLocaleString()} detail="Completed services this month" icon="people" />
        <StatCard title="Avg wait time" value={avgWait} detail={waitRecords.length ? `From queue join to service start · ${waitRecords.length} records` : 'Wait history unavailable'} icon="wait" tone="green" />
        <StatCard title="Return rate" value={retention} detail={retentionDetail} icon="repeat" tone="blue" />
      </section>

      {/* FlowCut AI Insights & Queue Tuning Section */}
      <section className={styles.aiSection}>
        <AiInsightsSection
          shopName={shopName}
          customersServed={monthRecords.length}
          revenue={currentRevenue}
          pricedCount={priceRecords.length}
          avgWait={avgWait}
          returnRate={retention}
          returningCount={returningCount}
          serviceStats={serviceStats}
          barberStats={barberStats}
          busiestHour={hourlySummary.busiestHour}
          busiestCount={hourlySummary.busiestCount}
          quietestHour={hourlySummary.quietestHour}
          quietestCount={hourlySummary.quietestCount}
          hourlyBreakdown={hourlySummary.hourlyBreakdown}
        />
      </section>

      <section className={styles.row2}>
        <article className={`${styles.card} ${styles.trendCard}`}>
          <h2>Revenue Trend (Last 6 Months)</h2>
          <p className={styles.cardSub}>Listed service value · {currentRevenue} so far this month</p>
          {recentRecords.some((record) => !Number.isFinite(record.price)) && <p className={styles.note}>Records without a saved price appear as unavailable or are excluded from partial totals.</p>}
          <TrendChart records={filteredRecords} />
        </article>
        <article className={`${styles.card} ${styles.shareCard}`}>
          <h2>Service Type Share</h2>
          <p className={styles.cardSub}>This month · grouped by catalog service name</p>
          <ServiceDonut records={monthRecords} />
        </article>
      </section>

      <section className={`${styles.card} ${styles.sectionCard}`}>
        <h2>Barber performance</h2>
        <p className={styles.cardSub}>This month · all barbers (outliers filtered for accurate duration averages)</p>
        <BarberTable records={allMonthRecords} barbers={barbers} selectedBarber={selectedBarber} />
        {allMonthRecords.some((record) => !Number.isFinite(record.price)) && <p className={styles.foot}>* Listed service value excludes records without a saved price.</p>}
      </section>

      <section className={`${styles.card} ${styles.sectionCard}`}>
        <h2>Busiest hours</h2>
        <p className={styles.cardSub}>Customers served by hour of day this month. Useful for planning barber shifts.</p>
        <BusiestHours records={monthRecords} />
      </section>

      <section className={`${styles.card} ${styles.sectionCard}`}>
        <h2>Haircut &amp; Service completion times</h2>
        <p className={styles.cardSub}>Statistical duration modeling (Median, Cleaned Mean, P80) to optimize queue wait-time estimation.</p>
        <CompletionTable key={selectedBarber} records={recentRecords} selectedBarber={selectedBarber} />
      </section>
      <span className={styles.srOnly}>{allMonthRecords.length} completed services recorded this month.</span>
    </div>
  );
}
