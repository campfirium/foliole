export function resolvePageText(textContent: unknown) {
  if (!textContent || typeof textContent !== 'object') {
    return '';
  }
  const items = Reflect.get(textContent, 'items');
  if (!Array.isArray(items)) {
    return '';
  }
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const text = Reflect.get(item, 'str');
      return typeof text === 'string' ? text : '';
    })
    .join('');
}
