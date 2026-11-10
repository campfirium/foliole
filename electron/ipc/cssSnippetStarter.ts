export const CSS_SNIPPET_STARTER_NAME = 'CSS Example.css';

export const CSS_SNIPPET_STARTER_SOURCE = `/*
 * Foliole desktop CSS configuration
 *
 * 1. Enable this file in Settings > Appearance > Custom CSS snippets.
 * 2. Edit the values in the SETTINGS block. Save the file, then refresh snippets.
 * 3. Open a Markdown document in Live Preview to check the editor and headings.
 *
 * Colors accept hex values (such as #8aa9dc) or CSS color functions.
 * Font sizes accept rem, em, or px. Use a number without a unit for line height.
 * Workspace tints are percentages. 0% keeps the app's usual color.
 *
 * The rules below SETTINGS connect these values to Foliole's interface.
 * For other changes, use Help > Developer Tools when available to inspect the
 * element. Selectors reflect the current version. Use plain CSS rules without
 * imports, external URLs, or nesting.
 */

/* SETTINGS: edit the values in this block. */
:root {
  /* Markdown editor */
  --foliole-custom-editor-font-size: 1.1rem;
  --foliole-custom-editor-line-height: 1.8;
  --foliole-custom-editor-background: color-mix(in srgb, var(--role-accent) 4%, transparent);
  --foliole-custom-editor-selection: var(--app-text-selection-bg-color);

  /* Heading colors, one value for each Markdown heading level */
  --foliole-custom-h1-color: var(--role-accent);
  --foliole-custom-h2-color: color-mix(in srgb, var(--role-accent) 75%, var(--role-text));
  --foliole-custom-h3-color: color-mix(in srgb, var(--role-accent) 50%, var(--role-text));
  --foliole-custom-h4-color: var(--role-text);
  --foliole-custom-h5-color: var(--role-text);
  --foliole-custom-h6-color: var(--role-text);

  /* Heading sizes */
  --foliole-custom-h1-size: var(--content-panel-h1-font-size, 1.5rem);
  --foliole-custom-h2-size: var(--content-panel-h2-font-size, 1.25rem);
  --foliole-custom-h3-size: var(--content-panel-h3-font-size, 1.08rem);
  --foliole-custom-h4-size: 1em;
  --foliole-custom-h5-size: 1em;
  --foliole-custom-h6-size: 1em;

  /* Workspace backgrounds: mix in this much of the current accent color */
  --foliole-custom-folder-list-tint: 0%;
  --foliole-custom-topic-list-tint: 0%;
  --foliole-custom-right-sidebar-tint: 0%;
  --foliole-custom-left-toolbar-tint: 0%;
  --foliole-custom-dark-toolbar-tint: var(--foliole-custom-left-toolbar-tint);
}

/* APPLY SETTINGS */
[data-workspace-document-focus-target] .markdown-editor-host {
  --role-text-selection-bg: var(--foliole-custom-editor-selection);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-editor {
  background-color: var(--foliole-custom-editor-background);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-scroller {
  line-height: var(--foliole-custom-editor-line-height);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-content {
  font-size: var(--foliole-custom-editor-font-size);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-line-h1 {
  color: var(--foliole-custom-h1-color);
  font-size: var(--foliole-custom-h1-size);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-line-h2 {
  color: var(--foliole-custom-h2-color);
  font-size: var(--foliole-custom-h2-size);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-line-h3 {
  color: var(--foliole-custom-h3-color);
  font-size: var(--foliole-custom-h3-size);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-line-h4 {
  color: var(--foliole-custom-h4-color);
  font-size: var(--foliole-custom-h4-size);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-line-h5 {
  color: var(--foliole-custom-h5-color);
  font-size: var(--foliole-custom-h5-size);
}

[data-workspace-document-focus-target] .markdown-editor-host .cm-line-h6 {
  color: var(--foliole-custom-h6-color);
  font-size: var(--foliole-custom-h6-size);
}

.workspace-region-main-folder {
  --role-nav-bg: color-mix(in srgb, var(--role-accent) var(--foliole-custom-folder-list-tint), var(--workspace-region-main-folder-bg));
}

.workspace-region-main-topic {
  --role-list-bg: color-mix(in srgb, var(--role-accent) var(--foliole-custom-topic-list-tint), var(--workspace-region-main-topic-bg));
}

.workspace-region-main-sidebar {
  --role-sidebar-bg: color-mix(in srgb, var(--role-accent) var(--foliole-custom-right-sidebar-tint), var(--workspace-region-main-sidebar-bg));
}

.workspace-region-main-rail {
  --role-frame-bg: color-mix(in srgb, var(--role-accent) var(--foliole-custom-left-toolbar-tint), var(--workspace-region-main-rail-bg));
}

:root[data-resolved-base-color='dark'] .workspace-region-main-rail {
  --role-frame-bg: color-mix(in srgb, var(--role-accent) var(--foliole-custom-dark-toolbar-tint), var(--workspace-region-main-rail-bg));
}
`;
