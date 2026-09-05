export function syncMarkdownEditorAriaLabel(host: HTMLElement | null, ariaLabel: string | undefined) {
  const content = host?.querySelector<HTMLElement>('.cm-content');
  if (!content) return;
  if (ariaLabel) content.setAttribute('aria-label', ariaLabel);
  else content.removeAttribute('aria-label');
}
