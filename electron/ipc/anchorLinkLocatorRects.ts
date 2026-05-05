export function parseAnchorLinkLocatorRects(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`invalid argument: ${field}[${index}]`);
    }
    const rect = item as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
    if (typeof rect.x !== 'number' || !Number.isFinite(rect.x)) {
      throw new Error(`invalid argument: ${field}[${index}].x`);
    }
    if (typeof rect.y !== 'number' || !Number.isFinite(rect.y)) {
      throw new Error(`invalid argument: ${field}[${index}].y`);
    }
    if (typeof rect.width !== 'number' || !Number.isFinite(rect.width) || rect.width <= 0) {
      throw new Error(`invalid argument: ${field}[${index}].width`);
    }
    if (typeof rect.height !== 'number' || !Number.isFinite(rect.height) || rect.height <= 0) {
      throw new Error(`invalid argument: ${field}[${index}].height`);
    }
    return {
      height: Math.max(0, Math.min(1, rect.height)),
      width: Math.max(0, Math.min(1, rect.width)),
      x: Math.max(0, Math.min(1, rect.x)),
      y: Math.max(0, Math.min(1, rect.y))
    };
  });
}
