// Must match backend/src/validation/consentValidation.js exactly. If one
// is bumped without the other, the frontend's consent screen and the
// backend's requireCurrentConsent gate will disagree about whether a
// user's consent is current — the backend is authoritative either way
// (a mismatch just means the UI is stale, not that the wrong version
// gets enforced), but keep these in sync.
export const CURRENT_TERMS_VERSION = '1.0';
export const CURRENT_PRIVACY_VERSION = '1.0';

export const TERMS_SUMMARY = [
  'FlowCut helps you see a barbershop\'s live queue and estimated wait time, and lets you join that queue remotely.',
  'You\'re responsible for arriving within a shop\'s reservation window — repeated no-shows may affect your ability to reserve.',
  'Shops manage their own services, pricing, and staff; FlowCut provides the queue platform, not the haircut itself.',
  'Accounts are personal — don\'t share your login, and let us know if you think someone else has access to it.',
];

export const PRIVACY_SUMMARY = [
  'We collect your name, mobile number, and (optionally) email to create and secure your account.',
  'Queue and service data (which shop, which service, when) is used to run the queue and estimate waiting times.',
  'Historical operational data may be used for analytics such as average wait times — this uses aggregated data, not your identity.',
  'Public queue views show anonymized position/status only — other customers never see your name, number, or email.',
  'You can delete your account at any time from your profile. We anonymize your account information; shops\' operational records are kept in de-identified form so shop analytics stay accurate for other customers.',
];
