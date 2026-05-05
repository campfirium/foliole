const PAIRING_REQUEST_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  day: '2-digit'
});

export function formatCompanionPairingRequestTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return PAIRING_REQUEST_TIME_FORMATTER.format(date);
}
