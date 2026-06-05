import { useLocalization } from '../../../../shared/localization/LocalizationProvider';
import {
  selectSkippedPlatformReleases,
  type UpdateCheckState,
  type UpdateReleaseNotes
} from '../../../../shared/platform/updateCheck';
import { SettingsRow } from '../../../../shared/ui';

interface SettingsUpdateReleaseNotesProps {
  currentVersion: string;
  state: UpdateCheckState;
}

function getReleaseNotes(state: UpdateCheckState, locale: 'en' | 'zh-Hans', version: string): UpdateReleaseNotes | null {
  return state.cachedReleaseNotes?.[locale]?.[version] ?? state.cachedReleaseNotes?.en?.[version] ?? null;
}

export function SettingsUpdateReleaseNotes({ currentVersion, state }: SettingsUpdateReleaseNotesProps) {
  const { locale, t } = useLocalization();
  const releases = selectSkippedPlatformReleases(state.cachedManifest, currentVersion, state.latestVersion);
  if (state.lastCheckStatus !== 'available' || !releases.length) return null;

  return (
    <SettingsRow
      description={t('settings.about.update.pending.description')}
      readonly
      title={t('settings.about.update.pending.title')}
    >
      <div className="w-full max-w-[640px] space-y-4 text-sm leading-6 text-foreground/72">
        {releases.map((release) => {
          const releaseNotes = getReleaseNotes(state, locale, release.version);
          return (
            <section aria-label={t('settings.about.update.pending.versionAria', { version: release.version })} key={release.version}>
              <h5 className="font-normal text-foreground">
                {t('settings.about.update.pending.versionLabel', { version: release.version })}
                {release.date ? <span className="text-foreground/52"> · {release.date}</span> : null}
              </h5>
              {releaseNotes?.summary ? <p className="mt-0.5 text-foreground/64">{releaseNotes.summary}</p> : null}
              {releaseNotes?.notes.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {releaseNotes.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </SettingsRow>
  );
}
