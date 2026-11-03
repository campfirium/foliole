/** POSIX archive entry paths, independent of the host filesystem. */
function normalize(value: string) {
  const absolute = value.startsWith('/');
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
    else if (part !== '..' || !absolute) parts.push(part);
  }
  const result = `${absolute ? '/' : ''}${parts.join('/')}` || '.';
  return value.endsWith('/') && result !== '/' ? result + '/' : result;
}
function basename(value: string, suffix = '') {
  const name = value.replace(/\/+$/u, '').split('/').pop() ?? '';
  return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
function dirname(value: string) {
  const clean = value.replace(/\/+$/u, '');
  const slash = clean.lastIndexOf('/');
  return slash < 0 ? '.' : clean.slice(0, slash) || '/';
}
const posix = { normalize, basename, dirname, join: (...parts: string[]) => normalize(parts.filter(Boolean).join('/')) };
export const epubPath = { ...posix, posix, extname: (value: string) => {
  const name = basename(value);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
} };
