export function acquireServiceSubmission(lock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseServiceSubmission(lock) {
  lock.current = false;
}
