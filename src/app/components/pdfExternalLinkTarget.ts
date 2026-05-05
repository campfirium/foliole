export function resolvePdfExternalHref(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }
  const anchor = target.closest<HTMLAnchorElement>('.react-pdf__Page__annotations a[href], .textLayer a[href]');
  const href = anchor?.href?.trim();
  return href ? href : null;
}

