import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { DisplayScaleProvider } from '../../features/settings/context/DisplayScaleProvider';
import { runContentRegionScaleCommand } from '../commands/contentRegionScaleCommands';
import { APP_COMMAND_IDS } from '../commands/ids';

import { ScalablePanel } from './ScalablePanel';

beforeEach(() => window.localStorage.clear());

it('targets the active panel and compensates its scaled coordinate plane', async () => {
  const { container, rerender } = render(
    <DisplayScaleProvider>
      <ScalablePanel className="h-80 w-80" label="Folder navigation" panelId="folder-navigation">
        <button type="button">Folder</button>
      </ScalablePanel>
    </DisplayScaleProvider>
  );

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Folder' }));
  act(() => {
    expect(runContentRegionScaleCommand(APP_COMMAND_IDS.increaseContentRegionScale)).toBe(true);
  });
  const scaledContent = container.querySelector('[data-panel-scale-id] > div');
  await waitFor(() => {
    expect(scaledContent).toHaveStyle({ height: '95.2381%', width: '95.2381%' });
    expect((scaledContent as HTMLElement).style.zoom).toBe('1.05');
    expect(screen.getByText('Folder navigation · 105%')).toBeInTheDocument();
  });

  rerender(
    <DisplayScaleProvider>
      <ScalablePanel enabled={false} label="Folder navigation" panelId="folder-navigation">
        <div>PDF surface</div>
      </ScalablePanel>
    </DisplayScaleProvider>
  );
  await waitFor(() => {
    expect(container.querySelector('[data-panel-scale-id]')).toBeNull();
    expect(runContentRegionScaleCommand(APP_COMMAND_IDS.increaseContentRegionScale)).toBe(false);
  });
});
