import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

describe('live markdown Readwise original file rendering', () => {
  beforeEach(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the Readwise omitted original file text as an editor attachment', async () => {
    const { adapter, host } = createAdapterHost([
      '# Book One',
      '',
      'Full text of this document omitted because this document is a PDF',
      '',
      '[Download original file →](https://readwise.io/reader/document_raw_content/1)'
    ].join('\n'));

    await waitFor(() => {
      const attachment = host.querySelector('.cm-md-readwise-original-file');
      expect(attachment).not.toBeNull();
      expect(attachment?.textContent).toContain('Original file not imported · PDF');
      expect(attachment?.textContent).toContain('readwise.io/reader/document_raw_content/1');
      expect(attachment?.querySelector('button[aria-label="Download original file"]')).not.toBeNull();
      expect(attachment?.querySelector('button[aria-label="Load original file"]')).not.toBeNull();
      expect(attachment?.querySelector('button[aria-label="Original file help"]')).not.toBeNull();
    });

    const help = host.querySelector<HTMLButtonElement>('button[aria-label="Original file help"]');
    const detail = host.querySelector<HTMLElement>('.cm-md-readwise-original-file-detail');
    expect(help?.getAttribute('aria-expanded')).toBe('false');
    expect(detail?.hidden).toBe(true);
    if (help) fireEvent.click(help);
    expect(help?.getAttribute('aria-expanded')).toBe('true');
    expect(detail?.hidden).toBe(false);
    expect(detail?.textContent).toContain('Download opens Readwise');

    adapter.destroy();
  });

  it('renders legacy pending Readwise Books status as an EPUB attachment', async () => {
    const { adapter, host } = createAdapterHost([
      '# 8个半月N1',
      '',
      '## Current status',
      '- No highlights yet',
      '- Original file missing',
      '- Book import pending',
      '',
      '## Next actions',
      '- Download original file*',
      '- Load original file*',
      '',
      '*In progress. These actions will be connected in a later task.*'
    ].join('\n'));

    await waitFor(() => {
      const attachment = host.querySelector('.cm-md-readwise-original-file');
      expect(attachment).not.toBeNull();
      expect(attachment?.textContent).toContain('Original file not imported · EPUB');
      expect(host.textContent).not.toContain('Current status');
    });

    adapter.destroy();
  });
});
