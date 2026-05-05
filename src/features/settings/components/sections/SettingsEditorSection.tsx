import type { MarkdownSyntaxVisibility } from '../../../editor/model/markdownSyntaxSetting';

export function SettingsEditorSection({
  markdownSyntaxVisibility,
  onMarkdownSyntaxVisibilityChange
}: {
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
}) {
  return (
    <section aria-label="Editor settings section" className="settings-group">
      <h3 className="settings-group-title">Live markdown</h3>
      <div className="settings-row">
        <div className="settings-row-copy">
          <h4>Markdown syntax visibility</h4>
          <p>Show markdown markers on active line, or keep them hidden.</p>
        </div>
        <label className="settings-select-wrap">
          <span className="sr-only">Markdown syntax visibility</span>
          <select className="settings-select" onChange={(event) => onMarkdownSyntaxVisibilityChange(event.target.value as MarkdownSyntaxVisibility)} value={markdownSyntaxVisibility}>
            <option value="hidden">Hidden</option>
            <option value="visible">Visible on active line</option>
          </select>
        </label>
      </div>
    </section>
  );
}
