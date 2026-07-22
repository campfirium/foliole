export type WordPressSiteKind = 'selfHosted' | 'unknown' | 'wordpressCom';

function normalizePath(pathname: string) {
  const value = pathname.replace(/\/+$/u, '');
  return value === '/' ? '' : value;
}

function withHttpsScheme(value: string) {
  const trimmed = value.trim();
  return /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizeWordPressSiteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(withHttpsScheme(value));
  } catch {
    throw new Error('Enter a valid HTTPS WordPress site address.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter a valid HTTPS WordPress site address.');
  }
  return `${url.origin}${normalizePath(url.pathname)}`;
}

export function getWordPressSiteKind(value: string): WordPressSiteKind {
  try {
    const hostname = new URL(normalizeWordPressSiteUrl(value)).hostname.toLowerCase();
    return hostname === 'wordpress.com' || hostname.endsWith('.wordpress.com')
      ? 'wordpressCom'
      : 'selfHosted';
  } catch {
    return 'unknown';
  }
}

export function normalizeWordPressApplicationPassword(value: string) {
  return value.replace(/\s/gu, '');
}

export function isWordPressApplicationPasswordValid(value: string, siteKind: WordPressSiteKind) {
  const length = normalizeWordPressApplicationPassword(value).length;
  if (siteKind === 'wordpressCom') return length === 16;
  if (siteKind === 'selfHosted') return length === 24;
  return false;
}

export function getWordPressSiteIdentity(value: string) {
  try {
    const url = new URL(withHttpsScheme(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${normalizePath(url.pathname)}`;
  } catch {
    return null;
  }
}
