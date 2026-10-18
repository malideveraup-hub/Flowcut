/** Prevents an older session check from overwriting a newer auth action. */
export function createAuthRequestGuard() {
  let authVersion = 0;
  let requestVersion = 0;

  return {
    begin() {
      return { authVersion, requestVersion: ++requestVersion };
    },
    invalidate() {
      authVersion += 1;
      requestVersion += 1;
    },
    isCurrent(request) {
      return request.authVersion === authVersion && request.requestVersion === requestVersion;
    },
  };
}
