import { useEffect, useRef, useState } from 'react';
import { askOwnShopAnalyticsAssistant, fetchOwnShop, fetchOwnShopAnalytics } from '../../api/shopAdminApi';
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
const SUGGESTED_PROMPTS = [
  'How is my shop doing this week?',
  'Why are waits longer today?',
  'What can FlowCut do for my shop?',
];

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

function assistantHistoryText(content) {
  return ['observedFacts', 'interpretations', 'recommendations', 'limitations']
    .flatMap((group) => content[group] || [])
    .map((item) => `${item.text} ${item.evidence.map((source) => `${source.label}: ${source.value}`).join('; ')}`)
    .join(' ');
}

function AssistantText({ children }) {
  const parts = String(children).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
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

function formatChatErrorMessage(rawError) {
  const msg = rawError?.message || String(rawError || '');
  if (/timed? ?out|too long/i.test(msg)) {
    return 'The AI assistant took too long to respond. Please try again.';
  }
  if (/rate limit|too many requests|busy right now/i.test(msg)) {
    return 'The AI assistant is busy right now. Please wait a moment before trying again.';
  }
  if (/quota|resource_exhausted/i.test(msg)) {
    return 'The AI assistant is busy right now. Please wait a moment before trying again.';
  }
  if (/network|fetch|connect|offline|reach/i.test(msg)) {
    return 'Unable to connect to the AI assistant. Check your connection and try again.';
  }
  if (/GEMINI_API_KEY|unauthorized|permission|not configured|configuration|model/i.test(msg)) {
    return 'The AI assistant is temporarily unavailable. Please contact your administrator if the problem continues.';
  }
  if (/unavailable|503|trouble/i.test(msg)) {
    return "We're having trouble generating your answer right now. Please try again shortly.";
  }
  if (/1 to 1000|400 characters|valid role/i.test(msg)) {
    return msg;
  }
  return msg || "We're having trouble generating your answer right now. Please try again shortly.";
}

export default function Analytics() {
  const initial = initialDateRange();
  const [datePreset, setDatePreset] = useState('week');
  const [draft, setDraft] = useState({ ...initial, serviceId: '', barberId: '' });
  const [filters, setFilters] = useState({ ...initial, serviceId: '', barberId: '', page: 1, pageSize: PAGE_SIZE });
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  const [lastChatMessage, setLastChatMessage] = useState('');
  const chatRequestInFlightRef = useRef(false);
  const chatTranscriptRef = useRef(null);
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

  useEffect(() => {
    if (!assistantOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setAssistantOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [assistantOpen]);

  useEffect(() => {
    if (assistantOpen && chatTranscriptRef.current) {
      chatTranscriptRef.current.scrollTop = chatTranscriptRef.current.scrollHeight;
    }
  }, [assistantOpen, chatMessages, chatLoading]);

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

  async function sendChat(rawMessage = chatInput, retry = false) {
    const message = rawMessage.trim();
    if (!message || chatLoading || chatRequestInFlightRef.current || message.length > 1000) return;
    chatRequestInFlightRef.current = true;
    const previousMessages = retry ? chatMessages.slice(0, -1) : chatMessages;
    setChatError('');
    setLastChatMessage(message);
    if (!retry) {
      setChatMessages((current) => [...current, { role: 'user', content: message }].slice(-19));
    }
    setChatLoading(true);
    const history = previousMessages.slice(-6).map((item) => ({
      role: item.role,
      content: (item.role === 'assistant'
        ? `Previous filters: ${item.content.context.dateRange}; ${item.content.context.service}; ${item.content.context.barber}. ${assistantHistoryText(item.content)}`
        : item.content).slice(0, 400),
    }));
    try {
      const result = await askOwnShopAnalyticsAssistant(message, history, {
        from: filters.from,
        to: filters.to,
        serviceId: filters.serviceId,
        barberId: filters.barberId,
      });
      setChatMessages((current) => [...current, { role: 'assistant', content: result }].slice(-20));
      setChatInput((current) => current === message ? '' : current);
    } catch (err) {
      setChatError(formatChatErrorMessage(err));
    } finally {
      chatRequestInFlightRef.current = false;
      setChatLoading(false);
    }
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

  function startNewChat() {
    setChatMessages([]);
    setChatInput('');
    setChatError('');
    setLastChatMessage('');
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
  return (
    <div className={styles.analytics}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.sub}>{shop?.name || 'Your shop'} · {analytics.range.from} to {analytics.range.to} (UTC)</p>
        </div>
      </header>

      <form className={styles.filters} onSubmit={applyFilters}>
        <label><span>Date range</span><DropdownSelect variant="standard" label="Date range" value={datePreset} onChange={selectDatePreset} options={Object.entries(DATE_PRESETS).map(([value, label]) => ({ value, label }))} /></label>
        <label><span>From</span><input type="date" value={draft.from} max={draft.to} onChange={(event) => updateDraft('from', event.target.value)} /></label>
        <label><span>To</span><input type="date" value={draft.to} min={draft.from} onChange={(event) => updateDraft('to', event.target.value)} /></label>
        <label><span>Service</span><DropdownSelect variant="standard" label="Service" value={draft.serviceId} onChange={(value) => updateDraft('serviceId', value)} options={[{ value: '', label: 'All services' }, ...analytics.services.map((service) => ({ value: service.id, label: service.name }))]} /></label>
        <label><span>Barber</span><DropdownSelect variant="standard" label="Barber" value={draft.barberId} onChange={(value) => updateDraft('barberId', value)} options={[{ value: '', label: 'All barbers' }, ...analytics.barbers.map((barber) => ({ value: barber.id, label: barber.name }))]} /></label>
        <div className={styles.filterActions}>
          <button type="submit" disabled={!!filterError}>Apply filters</button>
          <button className={styles.secondaryButton} type="button" onClick={resetFilters}>Reset</button>
        </div>
        {filterError && <p className={styles.filterError} role="alert">{filterError}</p>}
      </form>

      {assistantOpen && <button className={styles.assistantBackdrop} type="button" onClick={() => setAssistantOpen(false)} aria-label="Close assistant panel" />}
      <section
        id="flowcut-analytics-assistant"
        className={`${styles.panel} ${styles.aiPanel} ${assistantOpen ? styles.assistantDrawer : styles.assistantClosed} ${assistantExpanded ? styles.assistantExpanded : ''}`}
        role={assistantOpen ? 'dialog' : undefined}
        aria-modal={assistantOpen ? 'true' : undefined}
        aria-labelledby="ai-insights-heading"
        aria-hidden={!assistantOpen}
      >
        <div className={styles.aiHeader}>
          <div className={styles.panelHeader}>
            <div><h2 id="ai-insights-heading">Ask FlowCut</h2><p>Answers use this shop's selected analytics.</p></div>
          </div>
          <div className={styles.aiHeaderActions}>
            <button
              className={styles.expandAssistant}
              type="button"
              onClick={() => setAssistantExpanded((prev) => !prev)}
              aria-label={assistantExpanded ? 'Collapse assistant panel' : 'Expand assistant panel'}
              title={assistantExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {assistantExpanded ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>
            <button className={styles.closeAssistant} type="button" onClick={() => setAssistantOpen(false)} aria-label="Close assistant">×</button>
          </div>
        </div>
        <p className={styles.note}>When used, FlowCut sends aggregate statistics for this shop and filter range plus your recent chat messages to Google Gemini. Queue rows and customer identity details are not sent. Do not include customer personal information in messages.</p>
        <div className={styles.chatDivider} />
        <div className={styles.chatHeading}>
          <h3>Ask about your analytics</h3>
          <p>Ask about this shop’s metrics, how FlowCut works, or general barbershop operations. Analytics answers use the current filters. This chat stays in this browser session.</p>
          {!!chatMessages.length && <button className={styles.newChatButton} type="button" disabled={chatLoading} onClick={startNewChat}>Start new chat</button>}
        </div>
        {!chatMessages.length && (
          <div className={styles.promptList} aria-label="Suggested analytics questions">
            {SUGGESTED_PROMPTS.map((prompt) => <button type="button" key={prompt} disabled={chatLoading || !!filterError} onClick={() => sendChat(prompt)}>{prompt}</button>)}
          </div>
        )}
        {!!chatMessages.length && (
          <div className={styles.chatTranscript} ref={chatTranscriptRef} aria-label="Assistant conversation" aria-live="polite">
            {chatMessages.map((entry, index) => (
              <article className={entry.role === 'user' ? styles.userMessage : styles.assistantMessage} key={`${entry.role}-${index}`}>
                <strong>{entry.role === 'user' ? 'You' : 'FlowCut Analytics Assistant'}</strong>
                {entry.role === 'user' ? <p>{entry.content}</p> : (
                  <>
                    <p className={styles.contextLine}>Using {entry.content.context.dateRange} · {entry.content.context.service} · {entry.content.context.barber}</p>
                    <p>{entry.content.answer}</p>
                    {entry.content.observedFacts.length > 0 && <div><strong>Observed facts</strong><ul>{entry.content.observedFacts.map((item, itemIndex) => <li key={itemIndex}><AssistantText>{item.text}</AssistantText><small className={styles.chatEvidence}>Evidence: {item.evidence.map((source) => `${source.label}: ${source.value}`).join(' · ')}</small></li>)}</ul></div>}
                    {entry.content.interpretations.length > 0 && <div><strong>Possible explanations</strong><ul>{entry.content.interpretations.map((item, itemIndex) => <li key={itemIndex}><AssistantText>{item.text}</AssistantText><small className={styles.chatEvidence}>Evidence: {item.evidence.map((source) => `${source.label}: ${source.value}`).join(' · ')}</small></li>)}</ul></div>}
                    {entry.content.recommendations.length > 0 && <div><strong>Recommendations</strong><ul>{entry.content.recommendations.map((item, itemIndex) => <li key={itemIndex}><AssistantText>{item.text}</AssistantText><small className={styles.chatEvidence}>Evidence: {item.evidence.map((source) => `${source.label}: ${source.value}`).join(' · ')}</small></li>)}</ul></div>}
                    {entry.content.limitations.length > 0 && <div><strong>Limitations</strong><ul>{entry.content.limitations.map((item, itemIndex) => <li key={itemIndex}><AssistantText>{item.text}</AssistantText><small className={styles.chatEvidence}>Evidence: {item.evidence.map((source) => `${source.label}: ${source.value}`).join(' · ')}</small></li>)}</ul></div>}
                  </>
                )}
              </article>
            ))}
            {chatLoading && <p className={styles.aiMessage} role="status">Checking the latest filtered analytics…</p>}
          </div>
        )}
        {chatError && <div className={styles.chatError} role="alert"><span>{chatError}</span><button type="button" disabled={chatLoading} onClick={() => sendChat(lastChatMessage, true)}>Try again</button></div>}
        <form className={styles.chatForm} onSubmit={(event) => { event.preventDefault(); sendChat(); }}>
          <label className={styles.srOnly} htmlFor="analytics-chat-message">Ask a question about this shop’s analytics</label>
          <textarea id="analytics-chat-message" value={chatInput} maxLength={1000} rows={2} disabled={chatLoading} placeholder="Ask a follow-up, about your shop, or how FlowCut works…" onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendChat(); } }} />
          <button className={styles.aiButton} type="submit" disabled={chatLoading || !!filterError || !chatInput.trim()}>{chatLoading ? 'Sending…' : 'Send'}</button>
        </form>
        <p className={styles.note}>Up to 1,000 characters per message. Do not enter customer names, emails, or other personal details.</p>
      </section>

      {!assistantOpen && <button className={styles.askFlowcut} type="button" aria-expanded={assistantOpen} aria-controls="flowcut-analytics-assistant" onClick={() => setAssistantOpen(true)}>✦ Ask FlowCut</button>}

      <section className={styles.metricGrid} aria-label="Analytics summary">
        <MetricCard label="Avg wait" value={formatMinutes(summary.averageWaitMinutes)} detail={`${summary.waitSampleCount} valid timed records`} />
        <MetricCard label="Avg service time" value={formatMinutes(summary.averageMinutes)} detail={`${summary.sampleCount} valid · ${summary.outlierCount} excluded`} />
        <MetricCard label="Completed visits" value={summary.customersServed.toLocaleString()} detail={`${summary.customersJoined.toLocaleString()} visits joined`} />
        <MetricCard label="Cancellation rate" value={formatPercent(summary.cancellationRatePercent)} detail={`${summary.cancelledVisits} of ${summary.finalizedVisits} completed or cancelled visits`} />
        <MetricCard label="Long-wait rate" value={formatPercent(summary.waitsOver30Percent)} detail={`${summary.waitsOver30Count} of ${summary.waitSampleCount} observed waits over 30 min`} />
      </section>

      <section className={styles.chartGrid} aria-label="Customer traffic">
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Queue activity by day</h2><p><span className={styles.legendJoin} /> Joined · <span className={styles.legendComplete} /> completed · <span className={styles.legendCancel} /> cancelled · click a day to filter</p></div></div>
          <DateTrafficChart daily={analytics.daily} onSelectDay={selectDay} />
          <div className={styles.trendHeading}><strong>Average wait by service day</strong><span>Valid completed visits</span></div>
          <WaitTrendChart daily={analytics.daily} onSelectDay={selectDay} />
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Customer traffic by hour</h2><p>Queue entries joined by hour (UTC), not the number waiting at one moment</p></div></div>
          <HourlyTrafficChart hourly={analytics.hourly} />
          <div className={styles.peakSummary}>
            <p>Peak hours</p>
            {analytics.peakHours ? (
              <div>
                <span><small>Busiest observed hour</small><strong>{formatHourRange(analytics.peakHours.busiest.hour)}</strong><small>{analytics.peakHours.busiest.count} queue entries</small></span>
                <span><small>Least busy observed hour</small><strong>{formatHourRange(analytics.peakHours.quietest.hour)}</strong><small>{analytics.peakHours.quietest.count} queue entries</small></span>
              </div>
            ) : <small>{summary.customersJoined ? 'Busy-hour comparison needs at least 10 joined entries across two observed hours.' : 'No queue entries in this date range.'}</small>}
          </div>
        </article>
      </section>

      <section className={styles.chartGrid} aria-label="Waiting time analysis">
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Waiting-time distribution</h2><p>Actual queue join to recorded service start</p></div></div>
          {summary.waitSampleCount ? <WaitDistribution bins={analytics.waitDistribution} sampleCount={summary.waitSampleCount} /> : <p className={styles.empty}>N/A · No completed services have usable join and start timestamps in this range.</p>}
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Queue status right now</h2><p>Live snapshot · selected service and barber filters apply</p></div></div>
          <QueueStatusDonut statuses={analytics.queueStatusBreakdown || {}} />
        </article>
      </section>

      <section className={styles.chartGrid} aria-label="Service and barber performance">
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Most requested services</h2><p>Queue entries requested in this period · select to filter</p></div></div>
          <PopularityChart services={analytics.serviceStats} total={analytics.serviceStats.reduce((sum, service) => sum + (service.requestedCount || 0), 0)} onSelect={(serviceId) => { setDraft((current) => ({ ...current, serviceId })); setFilters((current) => ({ ...current, serviceId, page: 1 })); }} />
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead><tr><th>Service</th><th>Completed</th><th>Median</th><th>Avg duration</th><th>80% complete by</th><th>Excluded durations</th></tr></thead>
              <tbody>
                {analytics.serviceStats.map((service) => <tr key={service.serviceId}><th scope="row">{service.serviceName}</th><td>{service.completedCount}</td><td>{formatMinutes(service.medianMinutes)}</td><td>{formatMinutes(service.averageMinutes)}</td><td>{formatMinutes(service.percentile80Minutes)}</td><td>{service.outlierCount}</td></tr>)}
                {!analytics.serviceStats.length && <tr><td className={styles.emptyCell} colSpan="6">No recorded service sessions for these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Barber workload</h2><p>{summary.currentAvailableBarbers} currently available · select one to filter</p></div></div>
          <WorkloadChart barbers={analytics.barberStats} onSelect={(barberId) => { setDraft((current) => ({ ...current, barberId })); setFilters((current) => ({ ...current, barberId, page: 1 })); }} />
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead><tr><th>Barber</th><th>Completed</th><th>Avg service</th><th>Availability now</th></tr></thead>
              <tbody>
                {analytics.barberStats.map((barber) => <tr key={barber.barberId || barber.barberName}><th scope="row">{barber.barberName}</th><td>{barber.completedCount}</td><td>{formatMinutes(barber.averageMinutes)}</td><td>{barber.currentAvailability ? barber.currentAvailability.replace('_', ' ').toLowerCase() : 'Former barber'}</td></tr>)}
                {!analytics.barberStats.length && <tr><td className={styles.emptyCell} colSpan="4">No barber records for these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><h2>Recorded service sessions</h2><p>Underlying rows used for wait and duration analysis. No customer identity data is displayed.</p></div></div>
        <AnalyticsTable records={analytics.records} pagination={analytics.pagination} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} />
        <p className={styles.note}>Times and date filters use UTC. Wait is service start minus queue-entry creation. Service duration prefers the saved duration, then valid start-to-finish timestamps; invalid or implausible durations are excluded.</p>
      </section>
    </div>
  );
}
