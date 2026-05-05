import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import type { MarkdownSyntaxVisibility } from '../../../editor/model/markdownSyntaxSetting';

export function SettingsEditorSection({
  markdownSyntaxVisibility,
  onMarkdownSyntaxVisibilityChange
}: {
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
}) {
  return (
    <SettingsSection ariaLabel="Editor settings section" title="Live markdown">
      <SettingsRow
        description="Show markdown markers on active line, or keep them hidden."
        title="Markdown syntax visibility"
      >
        <SettingsControlSlot>
          <span className="sr-only">Markdown syntax visibility</span>
          <select
            className="w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground"
            onChange={(event) => onMarkdownSyntaxVisibilityChange(event.target.value as MarkdownSyntaxVisibility)}
            value={markdownSyntaxVisibility}
          >
            <option value="hidden">Hidden</option>
            <option value="visible">Visible on active line</option>
          </select>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
