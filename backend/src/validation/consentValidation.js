// Single source of truth for the current Terms & Conditions / Privacy
// Notice versions. Bumping either string here means every account whose
// stored termsVersion/privacyVersion doesn't match gets routed back
// through consent (requireCurrentConsent middleware) before they can use
// any protected, account-level feature — this is what "if the Terms or
// Privacy notice is updated, prompt renewed consent" actually means in
// code, not just a comment promising it.
//
// The frontend mirrors these exact strings in
// src/constants/legal.js — if you bump one here, bump it there too, or
// the frontend's consent screen and the backend's gate will disagree
// about whether a user's consent is current. (A `GET /api/legal/versions`
// endpoint would remove this duplication; not built in this pass to keep
// the change set focused — see the audit report's limitations.)
export const CURRENT_TERMS_VERSION = '1.0';
export const CURRENT_PRIVACY_VERSION = '1.0';

export function hasCurrentConsent(user) {
  if (!user) return false;
  return (
    user.termsAccepted === true &&
    user.privacyAccepted === true &&
    user.termsVersion === CURRENT_TERMS_VERSION &&
    user.privacyVersion === CURRENT_PRIVACY_VERSION
  );
}

/**
 * Validates the two consent checkboxes submitted at registration (or at
 * the renewed-consent endpoint). Section 12 is explicit: no pre-checked
 * boxes, and the user must ACTIVELY accept — so this only accepts the
 * literal boolean `true`, not "truthy" (a string "true", the number 1,
 * etc. are all rejected as the wrong type, closing off a class of sloppy
 * client bugs masquerading as consent).
 */
export function validateConsent({ termsAccepted, privacyAccepted }) {
  if (termsAccepted !== true) return 'You must accept the Terms and Conditions to continue.';
  if (privacyAccepted !== true) return 'You must accept the Privacy Notice to continue.';
  return null;
}
