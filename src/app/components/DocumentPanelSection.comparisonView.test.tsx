import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const manualDraftMocks = vi.hoisted(() => ({
  clearManualComparisonDraft: vi.fn(async () => undefined),
  loadManualComparisonDraft: vi.fn(async () => ''),
  saveManualComparisonDraft: vi.fn(async () => undefined)
}));

vi.mock('./manualComparisonDraftRepository', () => manualDraftMocks);

import {
  createSectionElement,
  getLatestComparisonPanelProps,
  mockSourceUpdatePreview,
  mockNoSourceUpdatePreview,
  openSourceUpdatePanel,
  openSourceUpdateReview,
  renderSection,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

const { clearManualComparisonDraft, loadManualComparisonDraft, saveManualComparisonDraft } = manualDraftMocks;

beforeEach(() => {
  clearManualComparisonDraft.mockReset();
  clearManualComparisonDraft.mockResolvedValue(undefined);
  loadManualComparisonDraft.mockReset();
  loadManualComparisonDraft.mockResolvedValue('');
  saveManualComparisonDraft.mockReset();
  saveManualComparisonDraft.mockResolvedValue(undefined);
});

describe('DocumentPanelSection manual comparison view', () => {
  it('keeps ordinary comparison in the Topic menu and out of the header icon row', async () => {
    renderSection();
    expect(screen.queryByRole('button', { name: 'Compare with Draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Source Update' })).not.toBeInTheDocument();
    const menuTrigger = screen.getByRole('button', { name: 'More editor options' });
    await act(async () => fireEvent.keyDown(menuTrigger, { key: 'ArrowDown' }));
    const menuItem = screen.getByRole('menuitem', { name: 'Compare with Draft' });
    fireEvent.click(menuItem);
    expect(getLatestComparisonPanelProps()).toMatchObject({
      comparisonMode: 'manual',
      comparisonSource: 'manual',
      manualContent: '',
      sourceAvailable: false
    });
  });

  it('preserves manual text while switching sources and reloads it after the view closes', async () => {
    mockSourceUpdatePreview();
    renderSection();
    expect(openSourceUpdateReview()).toMatchObject({ comparisonMode: 'source_preview', comparisonSource: 'source' });

    act(() => getLatestComparisonPanelProps()?.onSourceChange('manual'));
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Pasted revision'));
    act(() => getLatestComparisonPanelProps()?.onSourceChange('source'));
    act(() => getLatestComparisonPanelProps()?.onSourceChange('manual'));
    expect(getLatestComparisonPanelProps()).toMatchObject({ manualContent: 'Pasted revision' });

    act(() => getLatestComparisonPanelProps()?.onOpenChange(false));
    expect(saveManualComparisonDraft).toHaveBeenLastCalledWith('node-1', 'Pasted revision');
    loadManualComparisonDraft.mockResolvedValue('Pasted revision');
    expect(openSourceUpdateReview()).toMatchObject({ comparisonMode: 'source_preview', manualContent: '' });
    act(() => getLatestComparisonPanelProps()?.onSourceChange('manual'));
    await act(async () => undefined);
    expect(getLatestComparisonPanelProps()).toMatchObject({ manualContent: 'Pasted revision' });
  });

  it('keeps a manual session open when the source update disappears', () => {
    mockSourceUpdatePreview();
    const view = renderSection();
    openSourceUpdateReview();
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
    openSourceUpdateReview();
    mockNoSourceUpdatePreview();
    view.rerender(createSectionElement());
    expect(screen.queryByTestId('document-source-update-panel')).not.toBeInTheDocument();
  });
});

describe('DocumentPanelSection manual comparison actions', () => {
  it('keeps manual text on close without writing it to the current Topic', () => {
    const onNodeContentChange = vi.fn();
    renderSectionWithProps({ onNodeContentChange });
    openSourceUpdatePanel();
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Temporary only'));
    act(() => getLatestComparisonPanelProps()?.onOpenChange(false));
    expect(onNodeContentChange).not.toHaveBeenCalled();
    expect(saveManualComparisonDraft).toHaveBeenLastCalledWith('node-1', 'Temporary only');
  });

  it('sets the pasted text as body with one explicit write and closes', async () => {
    const onNodeContentChange = vi.fn();
    renderSectionWithProps({ onNodeContentChange });
    openSourceUpdatePanel();
    act(() => getLatestComparisonPanelProps()?.onManualContentChange('Replacement body'));
    await act(async () => getLatestComparisonPanelProps()?.onManualSetAsBody());
    expect(onNodeContentChange).toHaveBeenCalledTimes(1);
    expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Replacement body');
    expect(clearManualComparisonDraft).toHaveBeenCalledWith('node-1');
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
    expect(clearManualComparisonDraft).toHaveBeenCalledWith('node-1');
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
