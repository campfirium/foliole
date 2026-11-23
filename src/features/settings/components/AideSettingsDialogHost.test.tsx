import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultAideAttachedContextSettings } from '../../../../lib/core/assistant/aideAttachedContextSettings';
import { createDefaultAideToolPermissionSettings } from '../../../../lib/core/assistant/aideToolPermissionSettings';
import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { requestAideSettingsDialogOpen } from '../model/aideSettingsDialogRequests';

import { AideSettingsDialogHost } from './AideSettingsDialogHost';

const assistantRuntime = vi.hoisted(() => ({
  deleteAssistantModel: vi.fn(),
  loadAssistantAttachedContextSettings: vi.fn(),
  loadAssistantCustomInstructions: vi.fn(),
  loadAssistantModelSettings: vi.fn(),
  loadAssistantStatus: vi.fn(),
  loadAssistantStorageInfo: vi.fn(),
  loadAssistantToolPermissions: vi.fn(),
  openAssistantStorageLocation: vi.fn(),
  saveAssistantAttachedContextSettings: vi.fn(),
  saveAssistantCustomInstructions: vi.fn(),
  saveAssistantModelDraft: vi.fn(),
  saveAssistantToolPermissions: vi.fn(),
  selectAssistantModel: vi.fn(),
  startAssistantChatGptLogin: vi.fn(),
  testAssistantModel: vi.fn()
}));

vi.mock('../../../shared/platform/assistantRuntime', () => assistantRuntime);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  assistantRuntime.loadAssistantModelSettings.mockResolvedValue({ models: [], selected_model_id: 'codex' });
  assistantRuntime.loadAssistantStatus.mockResolvedValue({
    capabilities: [],
    provider: 'codex-app-server',
    state: 'ready'
  });
  assistantRuntime.loadAssistantCustomInstructions.mockResolvedValue({ text: 'Be brief.' });
  assistantRuntime.loadAssistantAttachedContextSettings.mockResolvedValue(createDefaultAideAttachedContextSettings());
  assistantRuntime.saveAssistantAttachedContextSettings.mockImplementation(async (settings: unknown) => settings);
  assistantRuntime.saveAssistantCustomInstructions.mockImplementation(async (text: string) => ({ text }));
  assistantRuntime.loadAssistantToolPermissions.mockResolvedValue(createDefaultAideToolPermissionSettings());
  assistantRuntime.saveAssistantToolPermissions.mockImplementation(async (settings: unknown) => settings);
  assistantRuntime.loadAssistantStorageInfo.mockResolvedValue({
    bytes: 2048,
    complete: true,
    issueCount: 0,
    path: '/tmp/aide'
  });
});

it('opens on request with model connections and local conversation data', async () => {
  renderWithLocalization(<AideSettingsDialogHost />);
  expect(screen.queryByRole('dialog')).toBeNull();

  act(() => requestAideSettingsDialogOpen());

  const dialog = await screen.findByRole('dialog', { name: 'Aide settings' });
  expect(within(dialog).getByRole('button', { name: 'Models and conversations' })).toHaveAttribute('aria-current', 'page');
  expect(within(dialog).queryByRole('heading', { name: 'Models and conversations' })).toBeNull();
  expect(within(dialog).getByRole('navigation', { name: 'Aide settings sections' })).toBeInTheDocument();
  expect(await within(dialog).findByRole('table', { name: /model/i })).toBeInTheDocument();
  expect(await within(dialog).findByText('Local conversation data')).toBeInTheDocument();

  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('loads custom instructions, counts characters and saves edits on this device', async () => {
  renderWithLocalization(<AideSettingsDialogHost />);
  act(() => requestAideSettingsDialogOpen());

  const field = await screen.findByRole('textbox', { name: 'Custom instructions' });
  await waitFor(() => expect(field).toHaveValue('Be brief.'));
  expect(field).toHaveAttribute('maxlength', '2000');
  expect(screen.getByText('9 / 2000')).toBeInTheDocument();

  fireEvent.change(field, { target: { value: 'Cite sources.' } });
  expect(screen.getByText('13 / 2000')).toBeInTheDocument();
  fireEvent.blur(field);
  await waitFor(() => expect(assistantRuntime.saveAssistantCustomInstructions).toHaveBeenCalledWith('Cite sources.'));
  expect(assistantRuntime.saveAssistantCustomInstructions).toHaveBeenCalledOnce();
});

async function openContextPane() {
  renderWithLocalization(<AideSettingsDialogHost />);
  act(() => requestAideSettingsDialogOpen());
  const dialog = await screen.findByRole('dialog', { name: 'Aide settings' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Attached content' }));
  return dialog;
}

function previewSections(dialog: HTMLElement) {
  return [...dialog.querySelectorAll('[data-preview-item]')].map((node) => node.getAttribute('data-preview-item'));
}

it('shows attached content items with a preview built by the real allocation', async () => {
  const dialog = await openContextPane();
  expect(within(dialog).getByRole('button', { name: 'Attached content' })).toHaveAttribute('aria-current', 'page');
  expect(within(dialog).getByRole('spinbutton', { name: 'Total budget (tokens)' })).toHaveValue(2100);
  expect(within(dialog).queryByRole('button', { name: 'Restore defaults' })).toBeNull();
  const preview = within(dialog).getByRole('region', { name: 'Attached content preview' });
  expect(within(preview).getByText(/More context isn’t always better/u)).toBeInTheDocument();
  expect(previewSections(dialog)).toEqual(['selection', 'metadata', 'surrounding', 'outline', 'location', 'annotations']);
  expect(within(preview).getByText('what matters')).toBeInTheDocument();
  expect(within(preview).getByText('User Guides / Foliole Aide')).toBeInTheDocument();

  fireEvent.mouseEnter(dialog.querySelector('[data-attached-context-item="outline"]')!);
  expect(dialog.querySelector('[data-preview-item="outline"]')?.className).toContain('bg-primary/10');
  expect(dialog.querySelector('[data-preview-item="selection"]')?.className).not.toContain('bg-primary/10');
});

it('turns items off, reorders by keyboard, saves and restores defaults', async () => {
  const dialog = await openContextPane();
  fireEvent.click(within(dialog).getByRole('switch', { name: 'Attach Path and membership' }));
  await waitFor(() => expect(previewSections(dialog)).not.toContain('location'));
  fireEvent.keyDown(within(dialog).getByRole('button', { name: /^Reorder Related notes/u }), { key: 'ArrowUp' });
  const rows = [...dialog.querySelectorAll('[data-attached-context-item]')].map((node) => node.getAttribute('data-attached-context-item'));
  expect(rows.slice(-2)).toEqual(['annotations', 'location']);
  await waitFor(() => expect(assistantRuntime.saveAssistantAttachedContextSettings).toHaveBeenCalled());
  const saved = assistantRuntime.saveAssistantAttachedContextSettings.mock.calls.at(-1)?.[0];
  expect(saved.items.find((item: { key: string }) => item.key === 'location')).toMatchObject({ enabled: false });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Restore defaults' }));
  await waitFor(() => expect(previewSections(dialog)).toContain('location'));
  expect(assistantRuntime.saveAssistantAttachedContextSettings.mock.calls.at(-1)?.[0]).toEqual(createDefaultAideAttachedContextSettings());
});

it('switches AI read and modify tools and the per-reply read limit, saves them and restores defaults', async () => {
  renderWithLocalization(<AideSettingsDialogHost />);
  act(() => requestAideSettingsDialogOpen());
  const dialog = await screen.findByRole('dialog', { name: 'Aide settings' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'AI permissions' }));
  const read = await within(dialog).findByRole('region', { name: 'Read permissions' });
  const budget = within(read).getByRole('spinbutton', { name: 'Max read per reply (tokens)' });
  expect(budget).toHaveValue(20000);
  expect(within(read).getAllByRole('switch').map((node) => node.getAttribute('aria-label'))).toEqual([
    'Read other parts of a material', 'Read text from a PDF page', 'Locate the original text',
    'Find in the current material', 'Find in the library'
  ]);
  expect(within(dialog).queryByRole('button', { name: 'Restore defaults' })).toBeNull();

  const write = within(dialog).getByRole('region', { name: 'Edit permissions' });
  expect(within(write).getAllByRole('switch').map((node) => node.getAttribute('aria-label'))).toEqual([
    'Confirm before making changes', 'Create folders, topics, and Items', 'Create excerpts', 'Edit content',
    'Move and reorder', 'Manage indexes', 'Manage Dives', 'Move to and restore from trash'
  ]);

  const confirmBeforeChanges = within(write).getByRole('switch', { name: 'Confirm before making changes' });
  expect(confirmBeforeChanges).toBeChecked();
  fireEvent.click(confirmBeforeChanges);
  fireEvent.click(within(write).getByRole('switch', { name: 'Manage Dives' }));
  fireEvent.click(within(read).getByRole('switch', { name: 'Read text from a PDF page' }));
  fireEvent.change(budget, { target: { value: '8' } });
  expect(budget).toHaveValue(8);
  fireEvent.blur(budget);
  expect(budget).toHaveValue(1000);
  await waitFor(() => expect(assistantRuntime.saveAssistantToolPermissions).toHaveBeenCalled());
  expect(assistantRuntime.saveAssistantToolPermissions.mock.calls.at(-1)?.[0]).toMatchObject({
    askBeforeWrite: false, read: { readPdfPage: false, traceSource: true }, readBudget: 1000, write: { editContent: true, manageDives: false }
  });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Restore defaults' }));
  await waitFor(() => expect(assistantRuntime.saveAssistantToolPermissions.mock.calls.at(-1)?.[0])
    .toEqual(createDefaultAideToolPermissionSettings()));
  expect(budget).toHaveValue(20000);
});
