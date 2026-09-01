export function truncateAssistantThreadDisplayText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= limit
    ? normalized
    : normalized.slice(0, limit - 3).trimEnd() + '...';
}
