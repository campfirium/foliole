export function validPlayEditId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function playEditPath(value) {
  if (!validPlayEditId(value)) throw new Error('A valid Play edit identity is required');
  return `edits/${encodeURIComponent(value)}`;
}

export function openPlayEdit(value) {
  return typeof value === 'string' && value.startsWith('open:') && validPlayEditId(value.slice(5));
}
