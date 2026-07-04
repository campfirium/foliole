import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  acceptRuntimeIncomingUpdate,
  dismissRuntimeIncomingUpdate,
  mockIncomingUpdatePreview,
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

  it('dismisses incoming updates without accepting content', async () => {
    mockIncomingUpdatePreview();

    renderSectionWithProps({});

    const panelProps = openSourceUpdatePanel();
    await act(async () => {
      await panelProps?.onDismissIncomingUpdate?.();
    });

    expect(dismissRuntimeIncomingUpdate).toHaveBeenCalledWith('incoming-update-1');
    expect(acceptRuntimeIncomingUpdate).not.toHaveBeenCalled();
  });
});

describe('DocumentPanelSection incoming updates', () => {
  it('does not accept incoming updates when the panel only closes', () => {
    const onNodeContentChange = vi.fn();
    mockIncomingUpdatePreview();

    renderSectionWithProps({ onNodeContentChange });

    const panelProps = openSourceUpdatePanel();
    act(() => {
      panelProps?.onCurrentContentChange('Edited incoming update');
    });
    act(() => {
      panelProps?.onOpenChange(false);
    });

    expect(onNodeContentChange).not.toHaveBeenCalled();
    expect(acceptRuntimeIncomingUpdate).not.toHaveBeenCalled();
    expect(dismissRuntimeIncomingUpdate).not.toHaveBeenCalled();
  });

  it('accepts incoming updates with the incoming content when the current draft is unchanged', async () => {
    const onNodeContentChange = vi.fn();
    mockIncomingUpdatePreview();

    renderSectionWithProps({ editorContent: 'Current content', onNodeContentChange });

    const panelProps = openSourceUpdatePanel();
    await act(async () => {
      await panelProps?.onAcceptIncomingUpdate?.();
    });

    expect(acceptRuntimeIncomingUpdate).toHaveBeenCalledWith('incoming-update-1', 'Incoming content');
    expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Incoming content', { publishLocal: false });
    expect(dismissRuntimeIncomingUpdate).not.toHaveBeenCalled();
  });

  it('accepts incoming updates with the edited draft content', async () => {
    const onNodeContentChange = vi.fn();
    mockIncomingUpdatePreview();

    renderSectionWithProps({ onNodeContentChange });

    const panelProps = openSourceUpdatePanel();
    act(() => {
      panelProps?.onCurrentContentChange('Accepted incoming draft');
    });
    await act(async () => {
      await panelProps?.onAcceptIncomingUpdate?.();
    });

    expect(acceptRuntimeIncomingUpdate).toHaveBeenCalledWith('incoming-update-1', 'Accepted incoming draft');
    expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Accepted incoming draft', { publishLocal: false });
    expect(dismissRuntimeIncomingUpdate).not.toHaveBeenCalled();
  });
});
