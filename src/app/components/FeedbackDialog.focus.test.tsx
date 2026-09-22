import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { DEFAULT_WORKSPACE_RAIL_ITEMS } from '../../features/settings/model/workspaceRailSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { FeedbackDialog } from './FeedbackDialog';
import { WorkspaceDemoRailBottomActions } from './WorkspaceDemoRailBottomActions';
import { RailActionGroup } from './WorkspaceRailActions';

beforeAll(() => preloadTranslationCatalog('en'));
afterEach(() => vi.unstubAllGlobals());

let removeSource: () => void;

function FeedbackHarness({ demo = false }: { demo?: boolean }) {
  const [showSource, setShowSource] = useState(true);
  removeSource = () => setShowSource(false);
  const [open, setOpen] = useState(false);
  return <>
    {demo ? <WorkspaceDemoRailBottomActions onRunRailAction={() => setOpen(true)} /> : <RailActionGroup
      ariaLabel="Feedback sources"
      items={(showSource ? ['First source', 'Second source'] : ['Second source']).map((label) => ({
        ...DEFAULT_WORKSPACE_RAIL_ITEMS.find((item) => item.commandId === APP_COMMAND_IDS.sendFeedback)!,
        id: label, labelOverride: label
      }))}
      onRun={() => setOpen(true)}
    />}
    {open ? <FeedbackDialog endpoint="https://feedback.example.test" onClose={() => setOpen(false)} open /> : null}
  </>;
}

it('returns to the actual source after Escape across repeated openings', async () => {
  renderWithLocalization(<FeedbackHarness />);
  for (const name of ['First source', 'Second source']) {
    const source = screen.getByRole('button', { name });
    source.focus();
    fireEvent.click(source);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(source).toHaveFocus());
  }
});

it('keeps focus inside through success and returns to the source after Done', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
  renderWithLocalization(<FeedbackHarness />);
  const source = screen.getByRole('button', { name: 'First source' });
  source.focus();
  fireEvent.click(source);
  fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'Focus test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  const done = await screen.findByRole('button', { name: 'Done' });
  await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
  fireEvent.click(done);
  await waitFor(() => expect(source).toHaveFocus());
});

it('does not focus a removed source', async () => {
  renderWithLocalization(<FeedbackHarness />);
  const source = screen.getByRole('button', { name: 'First source' });
  source.focus();
  fireEvent.click(source);
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  act(() => removeSource());
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(source).not.toHaveFocus();
});

it('does not steal focus already moved elsewhere on close', async () => {
  renderWithLocalization(<FeedbackHarness />);
  const source = screen.getByRole('button', { name: 'First source' });
  const next = screen.getByRole('button', { name: 'Second source' });
  source.focus();
  fireEvent.click(source);
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  next.focus();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(next).toHaveFocus();
});


it('returns to the Demo feedback source after Escape', async () => {
  renderWithLocalization(<FeedbackHarness demo />);
  const source = screen.getByRole('button', { name: 'Send Feedback' });
  source.focus();
  fireEvent.click(source);
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(source).toHaveFocus());
});
