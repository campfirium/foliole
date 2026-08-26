function hasEvent(result, change, status) {
  return result?.events?.some((event) => event.change === change && event.status === status) === true;
}

export function verifySyncGroupDiscoveryAcceptance(first, second) {
  for (const result of [first, second]) {
    if (result?.status !== 'passed' || result.phase !== 'events-observed' ||
        !hasEvent(result, 'started', 'searching') || !hasEvent(result, 'stopped', 'stopped')) {
      throw new Error('iOS Sync Group discovery bridge-event acceptance evidence is incomplete.');
    }
  }
  return { first, second };
}
