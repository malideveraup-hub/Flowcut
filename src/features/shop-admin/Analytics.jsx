import { useState } from 'react';
import { fetchOwnShop, fetchOwnShopAnalytics } from '../../api/shopAdminApi';
import DropdownSelect from '../../components/ui/DropdownSelect';
import EmptyState from '../../components/ui/EmptyState';
import MetricCard from '../../components/staff/MetricCard';
import Skeleton from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import styles from './Analytics.module.css';

const PAGE_SIZE = 10;
const DATE_RANGE_DAYS = 90;
const DATE_PRESETS = { today: 'Today', week: 'Last 7 days', month: 'Last 30 days', custom: 'Custom range' };
const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => (
  `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`
));
function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function initialDateRange() {
  const today = new Date();
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  return { from: utcDateString(from), to: utcDateString(to) };
}

function formatMinutes(value) {
  return Number.isFinite(value) ? `${Math.round(value)} min` : 'N/A';
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'N/A';
}

function formatHourRange(hour) {
  const label = (value) => `${value % 12 || 12}:00 ${value < 12 ? 'AM' : 'PM'}`;
  return `${label(hour)}-${label((hour + 1) % 24)} UTC`;
}

function dateRangeError(from, to) {
  if (!from || !to) return 'Choose both a start and end date.';
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Choose valid dates.';
  if (start > end) return 'The start date must be on or before the end date.';
  if (end - start >= DATE_RANGE_DAYS * 24 * 60 * 60 * 1000) return `Choose a range of ${DATE_RANGE_DAYS} days or fewer.`;
  return '';
}

function DateTrafficChart({ daily, onSelectDay }) {
  const width = Math.max(360, daily.length * 42);
  const max = Math.max(1, ...daily.flatMap((day) => [day.joined, day.completed, day.cancelled || 0]));
  const y = (value) => 124 - (value / max) * 100;
  const points = (key) => daily.map((day, index) => `${daily.length <= 1 ? width / 2 : 24 + index * ((width - 48) / (daily.length - 1))},${y(day[key] || 0)}`).join(' ');
  if (!daily.some((day) => day.joined || day.completed || day.cancelled)) return <p className={styles.empty}>No queue activity in this date range.</p>;
  return (
    <div className={styles.chartScroller}>
      <svg className={styles.activityLine} style={{ '--daily-count': daily.length }} viewBox={`0 0 ${width} 150`} role="img" aria-label="Queue joins, completed visits, and cancellations by date">
        <line x1="20" y1="124" x2={width - 20} y2="124" />
        <polyline className={styles.lineJoined} points={points('joined')} />
        <polyline className={styles.lineCompleted} points={points('completed')} />
        <polyline className={styles.lineCancelled} points={points('cancelled')} />
        {daily.map((day, index) => {
          const x = daily.length <= 1 ? width / 2 : 24 + index * ((width - 48) / (daily.length - 1));
          return <g key={day.date}><title>{`${day.date}: ${day.joined} joined, ${day.completed} completed, ${day.cancelled || 0} cancelled`}</title><circle className={styles.joinedPoint} cx={x} cy={y(day.joined)} r="3" /><circle className={styles.completedPoint} cx={x} cy={y(day.completed)} r="3" /><circle className={styles.cancelledPoint} cx={x} cy={y(day.cancelled || 0)} r="3" /></g>;
        })}
      </svg>
      <div className={styles.lineDayLabels}>{daily.map((day) => <button type="button" key={day.date} title={`${day.date}: ${day.joined} joined, ${day.completed} completed, ${day.cancelled || 0} cancelled`} onClick={() => onSelectDay(day.date)}>{day.date.slice(5)}</button>)}</div>
    </div>
  );
}

function HourlyTrafficChart({ hourly }) {
  const max = Math.max(1, ...hourly.map((hour) => hour.joined));
  if (!hourly.some((hour) => hour.joined)) return <p className={styles.empty}>No queue entries were recorded in this date range.</p>;
  return (
    <div className={styles.chartScroller}>
      <div className={styles.hourlyBars}>
        {hourly.map((hour) => (
          <div className={styles.hourColumn} key={hour.hour} title={`${HOUR_LABELS[hour.hour]} UTC: ${hour.joined} queue entries joined; ${Number.isFinite(hour.averageWaitMinutes) ? `${Math.round(hour.averageWaitMinutes)} min average actual wait from ${hour.waitSampleCount} timed visits` : 'no valid actual-wait samples'}`}>
            <span className={styles.hourValue}>{hour.joined || ''}</span>
            <span className={styles.hourFill} style={{ height: `${hour.joined ? Math.max(3, (hour.joined / max) * 100) : 0}%` }} />
            <span className={styles.hourLabel}>{HOUR_LABELS[hour.hour]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WaitTrendChart({ daily, onSelectDay }) {
  const observed = daily.filter((day) => Number.isFinite(day.averageWaitMinutes));
  const max = Math.max(1, ...observed.map((day) => day.averageWaitMinutes));
  if (!observed.length) return <p className={styles.empty}>No valid completed-visit wait times in this date range.</p>;
  return <div className={styles.waitTrend}>{observed.map((day) => <button type="button" key={day.date} onClick={() => onSelectDay(day.date)} title={`${day.date}: ${Math.round(day.averageWaitMinutes)} min average from ${day.waitSampleCount} completed visits`}><span>{Math.round(day.averageWaitMinutes)}m</span><i><b style={{ height: `${Math.max(4, day.averageWaitMinutes / max * 100)}%` }} /></i><small>{day.date.slice(5)}</small></button>)}</div>;
}

function WaitDistribution({ bins, sampleCount, note }) {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  return (
    <div className={styles.distribution}>
      {bins.map((bin) => (
        <div className={styles.distributionRow} key={bin.label}>
          <span>{bin.label}</span>
          <span className={styles.distributionTrack}>
            <span className={styles.distributionFill} style={{ width: `${(bin.count / max) * 100}%` }} />
          </span>
          <strong>{bin.count}</strong>
          <small>{formatPercent(bin.percent)}</small>
        </div>
      ))}
      <p className={styles.note}>{note || `Based on ${sampleCount} valid queue-join-to-service-start observations.`}</p>
    </div>
  );
}

function PopularityChart({ services, total, onSelect }) {
  const max = Math.max(1, ...services.map((service) => service.requestedCount || 0));
  if (!total) return <p className={styles.empty}>No service requests in this range.</p>;
  return <div className={styles.servicePopularity}>{services.map((service) => <button type="button" key={service.serviceId} onClick={() => onSelect(service.serviceId)} title={`${service.serviceName}: ${service.requestedCount || 0} requests, ${service.completedCount} completed`}><span>{service.serviceName}</span><i><b style={{ width: `${(service.requestedCount || 0) / max * 100}%` }} /></i><strong>{service.requestedCount || 0}</strong><small>{service.completedCount} completed</small></button>)}</div>;
}

function QueueStatusDonut({ statuses }) {
  const entries = [
    ['Waiting', statuses.WAITING || 0, '#b58a55'], ['Called', statuses.CALLED || 0, '#697d91'],
    ['In service', statuses.IN_SERVICE || 0, '#425d52'], ['Delayed', statuses.DELAYED || 0, '#987a6b'],
    ['Paused', statuses.PAUSED || 0, '#594b64'], ['Joined', statuses.JOINED || 0, '#7b3437'],
  ];
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return <p className={styles.empty}>The current queue is clear.</p>;
  const slices = entries.map(([, count, color], index) => {
    const start = entries.slice(0, index).reduce((sum, entry) => sum + entry[1] / total * 100, 0);
    const cursor = start + count / total * 100;
    return `${color} ${start}% ${cursor}%`;
  });
  return <div className={styles.statusChart}><div className={styles.donut} style={{ background: `conic-gradient(${slices.join(', ')})` }}><span>{total}<small>active now</small></span></div><div className={styles.popularityLegend}>{entries.map(([label, count, color]) => <div key={label}><i style={{ background: color }} /><span>{label}</span><strong>{count}</strong><small>{formatPercent(count / total * 100)}</small></div>)}</div></div>;
}

function WorkloadChart({ barbers, onSelect }) {
  const max = Math.max(1, ...barbers.map((barber) => barber.completedCount));
  if (!barbers.length || !barbers.some((barber) => barber.completedCount)) return <p className={styles.empty}>No completed sessions for the selected filters.</p>;
  return <div className={styles.workload}>{barbers.map((barber) => <button type="button" key={barber.barberId || barber.barberName} onClick={() => barber.barberId && onSelect(barber.barberId)} title={`Filter by ${barber.barberName}: ${barber.completedCount} completed; ${formatMinutes(barber.averageMinutes)} average service`}><span>{barber.barberName}</span><i><b style={{ width: `${barber.completedCount / max * 100}%` }} /></i><strong>{barber.completedCount}</strong><small>{formatMinutes(barber.averageMinutes)} avg</small></button>)}</div>;
}

function AnalyticsTable({ records, pagination, onPageChange }) {
  return (
    <>
      <div className={styles.tableScroller}>
        <table className={styles.table}>
          <thead>
            <tr><th>Completed (UTC)</th><th>Service</th><th>Barber</th><th>Actual wait</th><th>Service duration</th></tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td data-label="Completed (UTC)">{new Date(record.finishedAt).toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td data-label="Service">{record.serviceName}</td>
                <td data-label="Barber">{record.barberName}</td>
                <td data-label="Actual wait">{formatMinutes(record.actualWaitMinutes)}</td>
                <td data-label="Service duration">{formatMinutes(record.durationMinutes)}</td>
              </tr>
            ))}
            {!records.length && <tr><td className={styles.emptyCell} colSpan="5">No completed services with recorded start and finish times in this range.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={styles.pager}>
        <span>Showing {pagination.total ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0}-{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} recorded services</span>
        <div>
          <button type="button" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next</button>
        </div>
      </div>
    </>
  );
}

export default function Analytics() {
  const initial = initialDateRange();
  const [datePreset, setDatePreset] = useState('week');
  const [draft, setDraft] = useState({ ...initial, serviceId: '', barberId: '' });
  const [filters, setFilters] = useState({ ...initial, serviceId: '', barberId: '', page: 1, pageSize: PAGE_SIZE });
  const { data: shop, loading: shopLoading, error: shopError, refetch: refetchShop } = useAsync(fetchOwnShop);
  const {
    data: analytics,
    loading: analyticsLoading,
    error: analyticsError,
    refetch,
  } = useAsync(
    () => fetchOwnShopAnalytics(filters),
    [filters.from, filters.to, filters.serviceId, filters.barberId, filters.page, filters.pageSize],
  );

  function updateDraft(field, value) {
    if (field === 'from' || field === 'to') setDatePreset('custom');
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectDatePreset(value) {
    setDatePreset(value);
    if (value === 'custom') return;
    const today = initialDateRange().to;
    const from = new Date(`${today}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - (value === 'today' ? 0 : value === 'month' ? 29 : 6));
    setDraft((current) => ({ ...current, from: from.toISOString().slice(0, 10), to: today }));
  }

  function applyFilters(event) {
    event.preventDefault();
    if (dateRangeError(draft.from, draft.to)) return;
    setFilters({ ...draft, page: 1, pageSize: PAGE_SIZE });
  }

  function selectDay(date) {
    setDatePreset('custom');
    const selected = { ...filters, from: date, to: date, page: 1 };
    setDraft({ from: date, to: date, serviceId: filters.serviceId, barberId: filters.barberId });
    setFilters(selected);
  }

  function resetFilters() {
    setDatePreset('week');
    const range = initialDateRange();
    setDraft({ ...range, serviceId: '', barberId: '' });
    setFilters({ ...range, serviceId: '', barberId: '', page: 1, pageSize: PAGE_SIZE });
  }

  const loading = shopLoading || analyticsLoading;
  const error = shopError || analyticsError;
  const filterError = dateRangeError(draft.from, draft.to);

  if (loading) {
    return <div className={styles.loading} aria-label="Loading shop analytics"><Skeleton height={28} width={240} /><Skeleton height={92} /><Skeleton height={220} /><Skeleton height={240} /></div>;
  }
  if (error) {
    return <EmptyState title="Analytics could not be loaded" body={error.message || 'Shop analytics are temporarily unavailable.'} actionLabel="Try again" onAction={() => { if (shopError) refetchShop(); if (analyticsError) refetch(); }} />;
  }

  const summary = analytics.summary;
  const dashboardMetrics = analytics.dashboardMetrics || {
    averageWaitMinutes: summary.averageWaitMinutes,
    averageServiceMinutes: summary.averageMinutes,
    completedVisits: summary.customersServed,
    cancellationRatePercent: summary.cancellationRatePercent,
    longWaitRatePercent: summary.waitsOver30Percent,
  };
  const chartData = analytics.chartData || analytics;
  return (
    <div className={styles.analytics}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.sub}>{shop?.name || 'Your shop'} · {analytics.range.from} to {analytics.range.to} (UTC)</p>
          <p className={styles.sub}>{analytics.calculationSource === 'gemini' ? 'Metrics and charts calculated with Gemini' : 'Metrics and charts calculated from recorded data'}</p>
        </div>
      </header>

      <form className={styles.filters} onSubmit={applyFilters}>
        <div className={styles.filterControls}>
          <label><span>Date range</span><DropdownSelect variant="standard" label="Date range" value={datePreset} onChange={selectDatePreset} options={Object.entries(DATE_PRESETS).map(([value, label]) => ({ value, label }))} /></label>
          <label><span>From</span><input type="date" value={draft.from} max={draft.to} onChange={(event) => updateDraft('from', event.target.value)} /></label>
          <label><span>To</span><input type="date" value={draft.to} min={draft.from} onChange={(event) => updateDraft('to', event.target.value)} /></label>
          <label><span>Service</span><DropdownSelect variant="standard" label="Service" value={draft.serviceId} onChange={(value) => updateDraft('serviceId', value)} options={[{ value: '', label: 'All services' }, ...analytics.services.map((service) => ({ value: service.id, label: service.name }))]} /></label>
          <label><span>Barber</span><DropdownSelect variant="standard" label="Barber" value={draft.barberId} onChange={(value) => updateDraft('barberId', value)} options={[{ value: '', label: 'All barbers' }, ...analytics.barbers.map((barber) => ({ value: barber.id, label: barber.name }))]} /></label>
        </div>
        <div className={styles.filterActions}>
          <button type="submit" disabled={!!filterError}>Apply filters</button>
          <button className={styles.secondaryButton} type="button" onClick={resetFilters}>Reset</button>
        </div>
        {filterError && <p className={styles.filterError} role="alert">{filterError}</p>}
      </form>

      <section className={styles.metricGrid} aria-label="Analytics summary" data-scroll-reveal>
        <MetricCard label="Avg wait" value={formatMinutes(dashboardMetrics.averageWaitMinutes)} detail={`${summary.waitSampleCount} valid timed records`} />
        <MetricCard label="Avg service time" value={formatMinutes(dashboardMetrics.averageServiceMinutes)} detail={`${summary.sampleCount} valid · ${summary.outlierCount} excluded`} />
        <MetricCard label="Completed visits" value={dashboardMetrics.completedVisits.toLocaleString()} detail={`${summary.customersJoined.toLocaleString()} visits joined`} />
        <MetricCard label="Cancellation rate" value={formatPercent(dashboardMetrics.cancellationRatePercent)} detail={`${summary.cancelledVisits} of ${summary.finalizedVisits} completed or cancelled visits`} />
        <MetricCard label="Long-wait rate" value={formatPercent(dashboardMetrics.longWaitRatePercent)} detail={`${summary.waitsOver30Count} of ${summary.waitSampleCount} observed waits over 30 min`} />
      </section>

      <section className={styles.chartGrid} aria-label="Customer traffic" data-scroll-reveal>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Queue activity by day</h2><p><span className={styles.legendJoin} /> Joined · <span className={styles.legendComplete} /> completed · <span className={styles.legendCancel} /> cancelled · click a day to filter</p></div></div>
          <DateTrafficChart daily={chartData.daily} onSelectDay={selectDay} />
          <div className={styles.trendHeading}><strong>Average wait by service day</strong><span>Valid completed visits</span></div>
          <WaitTrendChart daily={chartData.daily} onSelectDay={selectDay} />
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Customer traffic by hour</h2><p>Queue entries joined by hour (UTC), not the number waiting at one moment</p></div></div>
          <HourlyTrafficChart hourly={chartData.hourly} />
          <div className={styles.peakSummary}>
            <p>Peak hours</p>
            {chartData.peakHours ? (
              <div>
                <span><small>Busiest observed hour</small><strong>{formatHourRange(chartData.peakHours.busiest.hour)}</strong><small>{chartData.peakHours.busiest.count} queue entries</small></span>
                <span><small>Least busy observed hour</small><strong>{formatHourRange(chartData.peakHours.quietest.hour)}</strong><small>{chartData.peakHours.quietest.count} queue entries</small></span>
              </div>
            ) : <small>{summary.customersJoined ? 'Busy-hour comparison needs at least 10 joined entries across two observed hours.' : 'No queue entries in this date range.'}</small>}
          </div>
        </article>
      </section>

      <section className={styles.chartGrid} aria-label="Waiting time analysis">
        <article className={styles.panel} data-scroll-reveal>
          <div className={styles.panelHeader}><div><h2>Waiting-time distribution</h2><p>Actual queue join to recorded service start</p></div></div>
          {summary.waitSampleCount ? <WaitDistribution bins={chartData.waitDistribution} sampleCount={summary.waitSampleCount} /> : <p className={styles.empty}>N/A · No completed services have usable join and start timestamps in this range.</p>}
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Queue status right now</h2><p>Live snapshot · selected service and barber filters apply</p></div></div>
          <QueueStatusDonut statuses={chartData.queueStatusBreakdown || {}} />
        </article>
      </section>

      <section className={styles.chartGrid} aria-label="Service and barber performance" data-scroll-reveal>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Most requested services</h2><p>Queue entries requested in this period · select to filter</p></div></div>
          <PopularityChart services={chartData.serviceStats} total={chartData.serviceStats.reduce((sum, service) => sum + (service.requestedCount || 0), 0)} onSelect={(serviceId) => { setDraft((current) => ({ ...current, serviceId })); setFilters((current) => ({ ...current, serviceId, page: 1 })); }} />
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead><tr><th>Service</th><th>Completed</th><th>Median</th><th>Avg duration</th><th>80% complete by</th><th>Excluded durations</th></tr></thead>
              <tbody>
                {chartData.serviceStats.map((service) => <tr key={service.serviceId}><th scope="row">{service.serviceName}</th><td>{service.completedCount}</td><td>{formatMinutes(service.medianMinutes)}</td><td>{formatMinutes(service.averageMinutes)}</td><td>{formatMinutes(service.percentile80Minutes)}</td><td>{service.outlierCount}</td></tr>)}
                {!chartData.serviceStats.length && <tr><td className={styles.emptyCell} colSpan="6">No recorded service sessions for these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Barber workload</h2><p>{summary.currentAvailableBarbers} currently available · select one to filter</p></div></div>
          <WorkloadChart barbers={chartData.barberStats} onSelect={(barberId) => { setDraft((current) => ({ ...current, barberId })); setFilters((current) => ({ ...current, barberId, page: 1 })); }} />
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead><tr><th>Barber</th><th>Completed</th><th>Avg service</th><th>Availability now</th></tr></thead>
              <tbody>
                {chartData.barberStats.map((barber) => <tr key={barber.barberId || barber.barberName}><th scope="row">{barber.barberName}</th><td>{barber.completedCount}</td><td>{formatMinutes(barber.averageMinutes)}</td><td>{barber.currentAvailability ? barber.currentAvailability.replace('_', ' ').toLowerCase() : 'Former barber'}</td></tr>)}
                {!chartData.barberStats.length && <tr><td className={styles.emptyCell} colSpan="4">No barber records for these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className={styles.panel} data-scroll-reveal>
        <div className={styles.panelHeader}><div><h2>Recorded service sessions</h2><p>Underlying rows used for wait and duration analysis. No customer identity data is displayed.</p></div></div>
        <AnalyticsTable records={analytics.records} pagination={analytics.pagination} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} />
        <p className={styles.note}>Times and date filters use UTC. Wait is service start minus queue-entry creation. Service duration prefers the saved duration, then valid start-to-finish timestamps; invalid or implausible durations are excluded.</p>
      </section>
    </div>
  );
}
