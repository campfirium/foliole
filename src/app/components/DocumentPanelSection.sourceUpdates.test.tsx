import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  mockSourceUpdatePreview,
  openSourceUpdatePanel,
  renderSection,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

describe('DocumentPanelSection source updates', () => {
  it('opens the source update panel from the header action', () => {
    mockSourceUpdatePreview();

    renderSection();

    expect(openSourceUpdatePanel()).toBeDefined();
  });

  it('places the source update action before the more-options menu in the header', () => {
    mockSourceUpdatePreview();

    renderSection();

    const splitButton = document.querySelectorAll('[aria-label="Toggle source update panel"]').item(0);
    const moreButton = document.querySelectorAll('[aria-label="More editor options"]').item(0);

    expect(splitButton).toBeTruthy();
    expect(moreButton).toBeTruthy();
    expect(splitButton.compareDocumentPosition(moreButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('writes source update panel edits back when the panel closes', () => {
    const onNodeContentChange = vi.fn();
    mockSourceUpdatePreview();

    renderSectionWithProps({ onNodeContentChange });

    const panelProps = openSourceUpdatePanel();
    act(() => {
      panelProps?.onCurrentContentChange('Updated from split panel');
    });
    act(() => {
      panelProps?.onOpenChange(false);
    });

    expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Updated from split panel');
  });

  it('does not write back unchanged source update panel content on close', () => {
    const onNodeContentChange = vi.fn();
    mockSourceUpdatePreview();

    renderSectionWithProps({ editorContent: 'Current content', onNodeContentChange });

    const panelProps = openSourceUpdatePanel();
    act(() => {
      panelProps?.onOpenChange(false);
    });

    expect(onNodeContentChange).not.toHaveBeenCalled();
  });
});
