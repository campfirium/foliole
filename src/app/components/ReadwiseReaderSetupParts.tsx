import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { formatReadwiseSourceLabel } from './importSourceWorkspaceModel';
import { FolderButton, resolveFolderPathHint, resolveFolderPathLabel } from './ImportSourceWorkspaceTableParts';

function ReadwiseFolderMatrix(props: {
  onChooseFolder: (sourceId: string, field: 'highlightPath' | 'primaryPath') => void;
  sources: Array<{ id: string; label: string; highlightPath: string; primaryPath: string }>;
}) {
  const t = useTranslation();

  return (
    <div className="hidden gap-2 md:grid" style={{ gridTemplateColumns: `84px repeat(${props.sources.length}, minmax(0, 1fr))` }}>
      <div aria-hidden="true" />
      {props.sources.map((source) => (
        <div className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45" key={source.id}>
          {source.label}
        </div>
      ))}
      <div className="flex h-10 items-center px-1 text-sm font-medium text-foreground/62">{t('desktop.readwise.folder.content')}</div>
      {props.sources.map((source) => (
        <FolderButton
          key={`${source.id}-content`}
          label={t('desktop.readwise.folder.originalAria', { id: source.id })}
          onClick={() => props.onChooseFolder(source.id, 'primaryPath')}
          path={resolveFolderPathLabel(source.primaryPath, source.label)}
          {...definedProps({ tooltip: resolveFolderPathHint(source.primaryPath) })}
        />
      ))}
      <div className="flex h-10 items-center px-1 text-sm font-medium text-foreground/62">{t('desktop.readwise.folder.highlights')}</div>
      {props.sources.map((source) => (
        <FolderButton
          key={`${source.id}-highlights`}
          label={t('desktop.readwise.folder.highlightAria', { id: source.id })}
          onClick={() => props.onChooseFolder(source.id, 'highlightPath')}
          path={resolveFolderPathLabel(source.highlightPath, source.label)}
          {...definedProps({ tooltip: resolveFolderPathHint(source.highlightPath) })}
        />
      ))}
    </div>
  );
}

function ReadwiseFolderStack(props: {
  onChooseFolder: (sourceId: string, field: 'highlightPath' | 'primaryPath') => void;
  sources: Array<{ id: string; label: string; highlightPath: string; primaryPath: string }>;
}) {
  const t = useTranslation();

  return (
    <div className="space-y-3 md:hidden">
      {props.sources.map((source) => (
        <div className="space-y-2 rounded-lg border border-border/80 bg-bg-panel px-3 py-3" key={source.id}>
          <div className="text-sm font-semibold text-foreground">{source.label}</div>
          <div className="grid gap-2">
            <div className="space-y-1">
              <div className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">{t('desktop.readwise.folder.content')}</div>
              <FolderButton
                label={t('desktop.readwise.folder.originalAria', { id: source.id })}
                onClick={() => props.onChooseFolder(source.id, 'primaryPath')}
                path={resolveFolderPathLabel(source.primaryPath, source.label)}
                {...definedProps({ tooltip: resolveFolderPathHint(source.primaryPath) })}
              />
            </div>
            <div className="space-y-1">
              <div className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">{t('desktop.readwise.folder.highlights')}</div>
              <FolderButton
                label={t('desktop.readwise.folder.highlightAria', { id: source.id })}
                onClick={() => props.onChooseFolder(source.id, 'highlightPath')}
                path={resolveFolderPathLabel(source.highlightPath, source.label)}
                {...definedProps({ tooltip: resolveFolderPathHint(source.highlightPath) })}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReadwiseDirectorySection(props: {
  onChooseFolder: (sourceId: string, field: 'highlightPath' | 'primaryPath') => void;
  onChooseRootFolder: () => void;
  readwiseRootPath: string;
  sources: DraftImportSource[];
}) {
  const t = useTranslation();
  const sourceColumns = props.sources.map((source) => ({
    id: source.id,
    label: source.kind ? formatReadwiseSourceLabel(source.kind) : source.id,
    highlightPath: source.highlightPath,
    primaryPath: source.primaryPath
  }));

  return (
    <>
      <SettingsRow
        description={t('desktop.readwise.root.description')}
        title={t('desktop.readwise.root.title')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <FolderButton
            className={SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME}
            label={t('desktop.readwise.root.title')}
            onClick={props.onChooseRootFolder}
            path={resolveFolderPathLabel(props.readwiseRootPath, t('desktop.readwise.root.choose'))}
            {...definedProps({ tooltip: resolveFolderPathHint(props.readwiseRootPath) })}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <div className="relative px-5 py-5 before:absolute before:left-5 before:right-5 before:top-0 before:border-t before:border-settings-divider/55" data-settings-row>
        <div className="mb-4">
          <h4 className="text-[0.95rem] font-normal text-foreground">{t('desktop.readwise.category.title')}</h4>
          <p className="mt-0.5 text-sm text-foreground/65">{t('desktop.readwise.category.description')}</p>
        </div>
        <ReadwiseFolderMatrix onChooseFolder={props.onChooseFolder} sources={sourceColumns} />
        <ReadwiseFolderStack onChooseFolder={props.onChooseFolder} sources={sourceColumns} />
      </div>
    </>
  );
}

function getReadwiseTextInputWidth(value: string) {
  return `${Math.max(12, Math.min(34, value.length + 2))}ch`;
}

export function ReadwiseParserFields(props: {
  config: ReadwiseReaderConfig;
  onChange: (field: keyof ReadwiseReaderConfig, value: string) => void;
}) {
  const t = useTranslation();
  type ReadwiseParserField = Extract<
    keyof ReadwiseReaderConfig,
    'highlightSeparator' | 'highlightsHeading' | 'newHighlightsHeading' | 'noteKeyword' | 'tagKeyword'
  >;
  const fields: Array<{ field: ReadwiseParserField; label: string; description: string }> = [
    { field: 'highlightsHeading', label: t('desktop.readwise.parser.highlightsHeading.title'), description: t('desktop.readwise.parser.highlightsHeading.description') },
    { field: 'newHighlightsHeading', label: t('desktop.readwise.parser.newHighlightsHeading.title'), description: t('desktop.readwise.parser.newHighlightsHeading.description') },
    {
      field: 'highlightSeparator',
      label: t('desktop.readwise.parser.highlightSeparator.title'),
      description: t('desktop.readwise.parser.highlightSeparator.description')
    },
    {
      field: 'tagKeyword',
      label: t('desktop.readwise.parser.tagKeyword.title'),
      description: t('desktop.readwise.parser.tagKeyword.description')
    },
    {
      field: 'noteKeyword',
      label: t('desktop.readwise.parser.noteKeyword.title'),
      description: t('desktop.readwise.parser.noteKeyword.description')
    }
  ];

  return (
    <>
      {fields.map((entry) => (
        <SettingsRow description={entry.description} key={entry.field} title={entry.label}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <input
              aria-label={entry.label}
              className={settingsFieldClassName('max-w-full')}
              onChange={(event) => props.onChange(entry.field, event.target.value)}
              style={{ width: getReadwiseTextInputWidth(String(props.config[entry.field])) }}
              value={props.config[entry.field]}
            />
          </SettingsControlSlot>
        </SettingsRow>
      ))}
    </>
  );
}
