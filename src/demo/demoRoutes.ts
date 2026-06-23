export function canonicalGuidePath(slug: string, locale = 'en') {
  return `/${locale}/guides/${slug}/`;
}

export function canonicalDemoPath(locale = 'en') {
  return `/${locale}/demo/`;
}

export function resolveDemoLocalePathSegment(pathname: string) {
  const match = /^\/([a-z]{2}(?:-[a-z]+)?)\/(?:demo|guides)\//i.exec(pathname);
  return match?.[1]?.toLowerCase() ?? 'en';
}

export function resolveGuideSlugFromPath(pathname: string) {
  return /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?guides\/([^/]+)\/?$/i.exec(pathname)?.[1];
}

export function isLocaleDemoPath(pathname: string) {
  return /^\/[a-z]{2}(?:-[a-z]+)?\/demo\/?$/i.test(pathname);
}
