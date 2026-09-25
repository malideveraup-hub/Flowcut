// Restricts what a user can even TYPE into a field, before any
// validation runs. This is a UX improvement, not the security boundary
// (the backend re-validates everything regardless — see
// src/validation/*.js) — but Section 2 specifically calls out that
// number fields currently accept letters/symbols while typing, so this
// closes that gap at the source.

/** Keeps digits only, capped at 11 characters (Philippine mobile format). */
export function filterPhoneInput(value) {
  return value.replace(/\D/g, '').slice(0, 11);
}

/** Letters, spaces, apostrophes, hyphens, and periods only — mirrors the
 * backend's validateName format exactly so what's rejected server-side
 * was never really typeable in the first place. */
export function filterNameInput(value) {
  return value.replace(/[^A-Za-z\u00C0-\u017F' .-]/g, '').slice(0, 100);
}
