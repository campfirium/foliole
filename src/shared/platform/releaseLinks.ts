import { openExternalUrl } from './runtimeExternalNavigation';

export const FOLIOLE_RELEASE_LINKS = {
  discussions: 'https://github.com/campfirium/foliole/discussions',
  issues: 'https://github.com/campfirium/foliole/issues',
  releases: 'https://github.com/campfirium/foliole/releases',
  repository: 'https://github.com/campfirium/foliole',
  youtubePlaylist: 'https://www.youtube.com/playlist?list=PLHSd-CQdsfgKqQJCdT7wzobJrQG_79x7g'
} as const;

export type FolioleReleaseLinkId = keyof typeof FOLIOLE_RELEASE_LINKS;

export function openFolioleReleaseLink(id: FolioleReleaseLinkId) {
  return openExternalUrl(FOLIOLE_RELEASE_LINKS[id]);
}
