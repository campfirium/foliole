export function securityNotificationRoute(record) {
  const urgent = record.changes.some(({ previous, current }) => {
    if (current?.kind !== 'finding' || !['high', 'critical'].includes(current.severity)) return false;
    if (!previous) return true;
    return ['advisory', 'package', 'platform', 'versions', 'severity', 'riskDigest']
      .some(field => JSON.stringify(previous[field]) !== JSON.stringify(current[field]));
  });
  return urgent ? 'urgent-investigation' : 'centralized-check';
}
