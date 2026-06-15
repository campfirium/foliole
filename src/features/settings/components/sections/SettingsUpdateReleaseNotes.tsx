import { useLocalization } from '../../../../shared/localization/LocalizationProvider';
import {
  selectSkippedPlatformReleases,
  type UpdateRelease,
  type UpdateCheckState,
  type UpdateReleaseNotes
} from '../../../../shared/platform/updateCheck';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  settingsNestedDialogSurfaceClassName
} from '../../../../shared/ui';

interface SettingsUpdateReleaseNotesProps {
  currentVersion: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  state: UpdateCheckState;
}

type ReleaseNoteSection = {
  heading: string | null;
  notes: string[];
};

const RELEASE_NOTE_SECTION_HEADINGS = new Set(['New', 'Improved', 'Fixed', 'Changed', '新增', '优化', '修复', '变更']);

function getReleaseNotes(state: UpdateCheckState, locale: 'en' | 'zh-Hans', version: string): UpdateReleaseNotes | null {
  return state.cachedReleaseNotes?.[locale]?.[version] ?? state.cachedReleaseNotes?.en?.[version] ?? null;
}

function groupReleaseNotes(notes: string[]): ReleaseNoteSection[] {
  const sections: ReleaseNoteSection[] = [];
  let current: ReleaseNoteSection = { heading: null, notes: [] };
  for (const note of notes) {
    if (RELEASE_NOTE_SECTION_HEADINGS.has(note)) {
      if (current.notes.length) sections.push(current);
      current = { heading: note, notes: [] };
      continue;
    }
    current.notes.push(note);
  }
  if (current.notes.length) sections.push(current);
  return sections;
}

function ReleaseNotesList(props: {
  release: UpdateRelease;
  releaseNotes: UpdateReleaseNotes | null;
  versionAriaLabel: string;
  versionLabel: string;
}) {
  const sections = groupReleaseNotes(props.releaseNotes?.notes ?? []);
  return (
    <article aria-label={props.versionAriaLabel} className="space-y-3 border-t border-settings-divider/55 pt-4 first:border-t-0 first:pt-0">
      <header>
        <h3 className="text-ui-md font-medium text-foreground">
          {props.versionLabel}
          {props.release.date ? <span className="text-foreground/52"> · {props.release.date}</span> : null}
        </h3>
        {props.releaseNotes?.summary ? <p className="mt-1 text-ui-sm leading-6 text-foreground/62">{props.releaseNotes.summary}</p> : null}
      </header>
      {sections.map((section, index) => (
        <section className="space-y-1.5" key={`${section.heading ?? 'changes'}-${index}`}>
          {section.heading ? <h4 className="text-ui-sm font-medium text-foreground/76">{section.heading}</h4> : null}
          <ul className="list-disc space-y-1 pl-5 text-ui-sm leading-6 text-foreground/70">
            {section.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </section>
      ))}
    </article>
  );
}

export function SettingsUpdateReleaseNotes({ currentVersion, onOpenChange, open, state }: SettingsUpdateReleaseNotesProps) {
  const { locale, t } = useLocalization();
  const releases = selectSkippedPlatformReleases(state.cachedManifest, currentVersion, state.latestVersion);
  const visible = state.lastCheckStatus === 'available' && releases.length > 0;
  if (!visible) return null;

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          className={settingsNestedDialogSurfaceClassName(
            'shell',
            'grid max-h-[min(760px,calc(100dvh-36px))] w-[min(720px,calc(100vw-36px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0'
          )}
        >
          <header className="space-y-1.5 px-6 pb-3 pt-5">
            <AppDialogTitle className="text-ui-lg">{t('settings.about.update.pending.title')}</AppDialogTitle>
            <AppDialogDescription>{t('settings.about.update.pending.description')}</AppDialogDescription>
          </header>
          <div className="app-scrollbar min-h-0 overflow-auto px-6 pb-5 pt-3 [--app-scrollbar-thumb-color:rgb(var(--color-foreground)/0.05)] [--app-scrollbar-thumb-hover-color:rgb(var(--color-foreground)/0.12)]">
            <div className="space-y-4">
              {releases.map((release) => (
                <ReleaseNotesList
                  key={release.version}
                  release={release}
                  releaseNotes={getReleaseNotes(state, locale, release.version)}
                  versionAriaLabel={t('settings.about.update.pending.versionAria', { version: release.version })}
                  versionLabel={t('settings.about.update.pending.versionLabel', { version: release.version })}
                />
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <AppButton onClick={() => onOpenChange(false)} variant="default">{t('shared.close')}</AppButton>
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
