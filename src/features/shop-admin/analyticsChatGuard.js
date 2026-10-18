export function acquireChatRequest(ref) {
  if (ref.current) return false;
  ref.current = true;
  return true;
}

export function releaseChatRequest(ref) {
  ref.current = false;
}
