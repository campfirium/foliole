export function normalizeManualChildOrder(value: readonly string[] | null | undefined) {
  if (!value) {
    return null;
  }
  const seen = new Set<string>();
  const order = value.filter((nodeId) => {
    const normalized = nodeId.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
  return order.length > 0 ? order : null;
}

export function parseManualChildOrder(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? normalizeManualChildOrder(parsed)
      : null;
  } catch {
    return null;
  }
}

export function stringifyManualChildOrder(value: readonly string[] | null | undefined) {
  const normalized = normalizeManualChildOrder(value);
  return normalized ? JSON.stringify(normalized) : null;
}
