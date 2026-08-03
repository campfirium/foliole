import {
  compareVersionStrings,
  type UpdateManifest,
  type UpdateRelease,
  type UpdateReleaseNotes,
  type UpdateReleaseNotesCatalog
} from '../updateCheckModel';
import { releaseMatchesTarget, resolveRuntimeUpdateTarget, type UpdateTarget } from '../updateTarget';

export interface PlatformReleaseNotesSection {
  release: UpdateRelease;
  releaseNotes: UpdateReleaseNotes;
}

export function resolvePlatformReleaseNotes(notes: UpdateReleaseNotes | null | undefined, platform: string) {
  if (!notes) return null;
  const combined = [...notes.notes, ...(notes.platformNotes?.[platform] ?? [])];
  if (!combined.length && !notes.summary) return null;
  return { ...notes, notes: combined };
}

export function selectPlatformReleaseNoteSections(
  manifest: UpdateManifest | null,
  catalog: UpdateReleaseNotesCatalog | null | undefined,
  currentVersion: string | null,
  latestVersion: string | null,
  target: UpdateTarget = resolveRuntimeUpdateTarget()
): PlatformReleaseNotesSection[] {
  if (!manifest || !catalog || !currentVersion || !latestVersion) return [];
  return manifest.releases
    .filter((release) =>
      compareVersionStrings(release.version, currentVersion) > 0
        && compareVersionStrings(release.version, latestVersion) <= 0
    )
    .map((release) => ({
      release,
      releaseNotes: resolvePlatformReleaseNotes(catalog[release.version], target.platform)
    }))
    .filter((entry): entry is PlatformReleaseNotesSection => Boolean(entry.releaseNotes))
    .sort((left, right) => compareVersionStrings(right.release.version, left.release.version));
}

export function selectSkippedPlatformReleases(
  manifest: UpdateManifest | null,
  currentVersion: string | null,
  latestVersion: string | null,
  target: UpdateTarget = resolveRuntimeUpdateTarget()
) {
  if (!manifest || !currentVersion || !latestVersion) return [];
  return manifest.releases
    .filter((release) =>
      releaseMatchesTarget(release, target)
        && compareVersionStrings(release.version, currentVersion) > 0
        && compareVersionStrings(release.version, latestVersion) <= 0
    )
    .sort((left, right) => compareVersionStrings(right.version, left.version));
}
