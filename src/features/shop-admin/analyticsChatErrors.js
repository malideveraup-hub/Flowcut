function retryDelayText(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const amount = value >= 60 ? Math.ceil(value / 60) : value;
  const unit = value >= 60 ? 'minute' : 'second';
  return ` Try again in ${amount} ${unit}${amount === 1 ? '' : 's'}.`;
}

export function formatChatErrorMessage(error) {
  const retryDelay = retryDelayText(error?.retryAfterSeconds);
  if (['AI_APPLICATION_RATE_LIMIT', 'AI_CONCURRENCY_LIMIT'].includes(error?.code)) {
    return `AI-generated insights are temporarily unavailable because too many questions were sent. Your dashboard metrics and charts remain available.${retryDelay}`;
  }
  if (error?.code === 'GEMINI_QUOTA_EXHAUSTED') {
    return retryDelay
      ? `AI-generated insights are temporarily unavailable because the assistant reached its usage limit. Your dashboard metrics and charts remain available.${retryDelay} Contact the administrator if the problem continues.`
      : 'AI-generated insights are temporarily unavailable because the assistant reached its usage limit. Your dashboard metrics and charts remain available. Please try again later or contact the administrator.';
  }
  if (error?.code === 'GEMINI_RATE_LIMIT') {
    return `AI-generated insights are temporarily unavailable because the assistant is rate-limited. Your dashboard metrics and charts remain available.${retryDelay}`;
  }
  if (error?.code === 'GEMINI_TIMEOUT') {
    return 'AI-generated insights are temporarily unavailable because the assistant took too long to respond. Your dashboard metrics and charts remain available. Please try again later.';
  }
  if (['GEMINI_CONFIGURATION', 'GEMINI_BILLING_CONFIGURATION', 'GEMINI_MODEL_UNAVAILABLE', 'GEMINI_PROVIDER_UNAVAILABLE', 'GEMINI_NETWORK_ERROR', 'GEMINI_INVALID_REQUEST', 'AI_LIMITER_UNAVAILABLE'].includes(error?.code)) {
    return 'AI-generated insights are temporarily unavailable. Your dashboard metrics and charts remain available. Please contact the administrator if the problem continues.';
  }
  if (error?.code === 'GEMINI_INPUT_TOO_LARGE') {
    return 'The selected analytics request is too large. Narrow the date range or filters and try again.';
  }

  const message = error?.message || String(error || '');
  if (/1 to 1000|400 characters|at most 6|valid role|question and selected filters are too large/i.test(message)) return message;
  if (error?.status === 0 || /network|fetch|connect|offline|reach/i.test(message)) {
    return 'AI-generated insights are temporarily unavailable because FlowCut cannot reach the AI service. Your dashboard metrics and charts remain available. Try again later.';
  }
  return 'AI-generated insights are temporarily unavailable. Your dashboard metrics and charts remain available. Please try again later.';
}
