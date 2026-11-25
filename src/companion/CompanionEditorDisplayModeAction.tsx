import { CodeXml } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { toggleCompanionEditorDisplayMode, useCompanionEditorDisplayMode } from './companionEditorDisplayMode';
import { companionWorkspaceRowClass } from './CompanionWorkspaceMenuActions';

/** Reading "more" sheet row, shown while editing: switches the whole body between live preview and Markdown source. */
export function CompanionEditorDisplayModeAction(props: { onDone(): void }) {
  const t = useTranslation();
  const mode = useCompanionEditorDisplayMode();
  return (
    <button
      className={`${companionWorkspaceRowClass} gap-3 font-medium text-foreground transition-colors active:bg-companion-subtle/80`}
      data-testid="companion-reading-editor-display-mode"
      onClick={() => {
        toggleCompanionEditorDisplayMode();
        props.onDone();
      }}
      type="button"
    >
      <span className="shrink-0 text-companion-text-secondary"><CodeXml aria-hidden="true" className="h-5 w-5" /></span>
      <span>{t(mode === 'preview' ? 'desktop.document.switchToSource' : 'desktop.document.switchToLivePreview')}</span>
    </button>
  );
}
