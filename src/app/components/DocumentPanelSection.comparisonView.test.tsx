import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createSectionElement,
  getLatestComparisonPanelProps,
  mockSourceUpdatePreview,
  mockNoSourceUpdatePreview,
  openSourceUpdatePanel,
  renderSection,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

describe('DocumentPanelSection manual comparison view', () => {
  it('uses the formal compare command for ordinary Topics without requiring a source update', () => {
    renderSection();
    const trigger = screen.getByRole('button', { name: 'Compare with Draft' });
    expect(trigger).toHaveAttribute('data-command-id', 'document.toggleComparisonView');
    expect(openSourceUpdatePanel()).toMatchObject({
      comparisonMode: 'manual',
      comparisonSource: 'manual',
      manualContent: '',
      sourceAvailable: false
    });
  });

  it('preserves manual text while switching sources and resets it after the view closes', () => {
    mockSourceUpdatePreview();
    renderSection();
    expect(openSourceUpdatePanel()).toMatchObject({ comparisonMode: 'source_preview', comparisonSource: 'source' });

    act(() => getLatestComparisonPanelProps()?.onSourceChange('manual'));
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Pasted revision'));
    act(() => getLatestComparisonPanelProps()?.onSourceChange('source'));
    act(() => getLatestComparisonPanelProps()?.onSourceChange('manual'));
    expect(getLatestComparisonPanelProps()).toMatchObject({ manualContent: 'Pasted revision' });

    act(() => getLatestComparisonPanelProps()?.onOpenChange(false));
    expect(openSourceUpdatePanel()).toMatchObject({ comparisonMode: 'source_preview', manualContent: '' });
  });

  it('keeps a manual session open when the source update disappears', () => {
    mockSourceUpdatePreview();
    const view = renderSection();
    openSourceUpdatePanel();
    act(() => getLatestComparisonPanelProps()?.onSourceChange('manual'));
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Keep this session'));
    mockNoSourceUpdatePreview();
    view.rerender(createSectionElement());
    expect(getLatestComparisonPanelProps()).toMatchObject({
      comparisonMode: 'manual',
      manualContent: 'Keep this session',
      open: true,
      sourceAvailable: false
    });
  });

  it('closes a source session when its source update disappears', () => {
    mockSourceUpdatePreview();
    const view = renderSection();
    openSourceUpdatePanel();
    mockNoSourceUpdatePreview();
    view.rerender(createSectionElement());
    expect(screen.queryByTestId('document-source-update-panel')).not.toBeInTheDocument();
  });
});

describe('DocumentPanelSection manual comparison actions', () => {
  it('discards manual text on close without writing it to the current Topic', () => {
    const onNodeContentChange = vi.fn();
    renderSectionWithProps({ onNodeContentChange });
    openSourceUpdatePanel();
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Temporary only'));
    act(() => getLatestComparisonPanelProps()?.onOpenChange(false));
    expect(onNodeContentChange).not.toHaveBeenCalled();
  });

  it('sets the pasted text as body with one explicit write and closes', async () => {
    const onNodeContentChange = vi.fn();
    renderSectionWithProps({ onNodeContentChange });
    openSourceUpdatePanel();
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Replacement body'));
    await act(async () => getLatestComparisonPanelProps()?.onManualSetAsBody());
    expect(onNodeContentChange).toHaveBeenCalledTimes(1);
    expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Replacement body');
    expect(screen.queryByTestId('document-source-update-panel')).not.toBeInTheDocument();
  });

  it('creates a normal child Topic and selects it only after creation succeeds', async () => {
    const onCreateChildNode = vi.fn(async () => 'node-2');
    const onSelectNode = vi.fn();
    renderSectionWithProps({ onCreateChildNode, onSelectNode });
    openSourceUpdatePanel();
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Alternative topic body'));
    await act(async () => getLatestComparisonPanelProps()?.onManualSaveAsTopic());
    expect(onCreateChildNode).toHaveBeenCalledWith('node-1', 'Alternative topic body', 'topic');
    expect(onSelectNode).toHaveBeenCalledWith('node-2');
    expect(screen.queryByTestId('document-source-update-panel')).not.toBeInTheDocument();
  });

  it('keeps the view and manual text when child Topic creation returns null', async () => {
    const onCreateChildNode = vi.fn(async () => null);
    renderSectionWithProps({ onCreateChildNode });
    openSourceUpdatePanel();
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Retry this text'));
    await act(async () => getLatestComparisonPanelProps()?.onManualSaveAsTopic());
    expect(getLatestComparisonPanelProps()).toMatchObject({ manualContent: 'Retry this text', open: true });
  });
});
