import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { DisplayScaleProvider } from '../../features/settings/context/DisplayScaleProvider';
import { runContentRegionScaleCommand } from '../commands/contentRegionScaleCommands';
import { APP_COMMAND_IDS } from '../commands/ids';

import { ScalableContentRegion } from './ScalableContentRegion';

beforeEach(() => window.localStorage.clear());

it('targets the last activated region and keeps the physical region boundary fixed', async () => {
  const { container } = render(
    <DisplayScaleProvider>
      <ScalableContentRegion className="h-80 w-80" label="Folder navigation" regionId="folder-navigation">
        <button type="button">Folder</button>
      </ScalableContentRegion>
    </DisplayScaleProvider>
  );

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Folder' }));
  act(() => {
    expect(runContentRegionScaleCommand(APP_COMMAND_IDS.increaseContentRegionScale)).toBe(true);
  });
  const scaledContent = container.querySelector('[data-content-scale-region] > div');
  await waitFor(() => {
    expect(scaledContent).toHaveStyle({ height: '90.9090909090909%', width: '90.9090909090909%' });
    expect(screen.getByText('Folder navigation · 110%')).toBeInTheDocument();
  });
});
