const RELEASE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export function isValidDesktopUpdateVersion(version: string) {
  return RELEASE_VERSION.test(version);
}

export function desktopUpdateFeedUrl(version: string) {
  if (!isValidDesktopUpdateVersion(version)) {
    throw new Error('invalid desktop update target version');
  }
  return `https://github.com/campfirium/foliole/releases/download/v${version}/`;
}
