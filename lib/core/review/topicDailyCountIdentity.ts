export function topicDailyCountId(day: string, nodeId: string) {
  return `${day}:${nodeId}`;
}

export function validateReviewDayKey(value: unknown): asserts value is string {
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00Z`) : null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid review day');
  }
}
