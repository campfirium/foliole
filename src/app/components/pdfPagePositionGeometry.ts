export function resolvePdfPagePositionGeometry(shell: HTMLDivElement) {
  const page = shell.querySelector?.<HTMLElement>('.react-pdf__Page');
  const bounds = page?.getBoundingClientRect();
  if (!bounds || bounds.height <= 0) {
    return { height: Math.max(shell.clientHeight, 1), top: shell.offsetTop };
  }
  return { height: bounds.height,
    top: shell.offsetTop + bounds.top - shell.getBoundingClientRect().top };
}
