const STARTABLE_STATUSES = new Set(['WAITING', 'CALLED']);
const ACTIVE_STATUSES = new Set(['IN_SERVICE', 'DELAYED', 'PAUSED']);

function hasSpecificConflictMessage(message) {
  return Boolean(message && !/already updated|showing the latest/i.test(message));
}

export function resolveStartConflict(dashboard, entryId, fallbackMessage = '') {
  const current = dashboard?.current;
  if (current?.id === entryId && ACTIVE_STATUSES.has(current.status)) {
    return { type: 'started' };
  }

  if (current) {
    return { type: 'conflict', message: 'Finish your current service before starting another.' };
  }

  if (dashboard?.barber?.availability === 'ON_BREAK') {
    return { type: 'conflict', message: 'End your break before starting a service.' };
  }

  const queue = dashboard?.upNext || [];
  const entryIndex = queue.findIndex((entry) => entry.id === entryId);
  const firstEntry = queue[0];
  const barberAvailable = ['AVAILABLE', 'OFFLINE'].includes(dashboard?.barber?.availability);
  if (entryIndex === 0 && STARTABLE_STATUSES.has(firstEntry?.status) && barberAvailable) {
    return { type: 'retry' };
  }

  if (entryIndex > 0) {
    return { type: 'conflict', message: 'A different customer is now next. The queue has been refreshed.' };
  }

  return {
    type: 'conflict',
    message: hasSpecificConflictMessage(fallbackMessage)
      ? fallbackMessage
      : 'This customer is no longer waiting in your queue. The queue has been refreshed.',
  };
}

function contextualConflict(error, resolution) {
  const conflict = new Error(resolution.message);
  conflict.status = error.status;
  return conflict;
}

export async function startServiceWithConflictRecovery(entryId, startRequest, refreshDashboard) {
  try {
    return await startRequest(entryId);
  } catch (firstError) {
    if (firstError.status !== 409) throw firstError;

    let latest;
    try {
      latest = await refreshDashboard();
    } catch {
      throw firstError;
    }

    const resolution = resolveStartConflict(latest, entryId, firstError.message);
    if (resolution.type === 'started') return { alreadyStarted: true };
    if (resolution.type === 'conflict') throw contextualConflict(firstError, resolution);

    try {
      return await startRequest(entryId);
    } catch (retryError) {
      if (retryError.status !== 409) throw retryError;

      let afterRetry;
      try {
        afterRetry = await refreshDashboard();
      } catch {
        throw retryError;
      }
      const retryResolution = resolveStartConflict(afterRetry, entryId, retryError.message);
      if (retryResolution.type === 'started') return { alreadyStarted: true };
      throw contextualConflict(retryError, retryResolution);
    }
  }
}
