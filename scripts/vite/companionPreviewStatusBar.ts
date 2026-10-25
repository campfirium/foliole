export function createCompanionPreviewStatusBar(document: Document) {
  const bar = document.createElement('div');
  bar.className = 'preview-status-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = `
    <span class="preview-status-time">9:41</span>
    <span class="preview-status-icons">
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx=".7"/>
        <rect x="5" y="5.5" width="3" height="6.5" rx=".7"/>
        <rect x="10" y="3" width="3" height="9" rx=".7"/>
        <rect x="15" y="0" width="3" height="12" rx=".7"/>
      </svg>
      <svg width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M1 3.5a11 11 0 0 1 15 0M3.5 6a7.3 7.3 0 0 1 10 0M6 8.5a3.6 3.6 0 0 1 5 0"/>
        <circle cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
      <svg width="25" height="12" viewBox="0 0 25 12" fill="currentColor">
        <rect x=".6" y=".6" width="21" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".4"/>
        <rect x="2.5" y="2.5" width="17.2" height="7" rx=".8"/>
        <path d="M23 4v4a2 2 0 0 0 0-4" opacity=".4"/>
      </svg>
    </span>`;
  return bar;
}
