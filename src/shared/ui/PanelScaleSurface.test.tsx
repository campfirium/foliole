import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it } from 'vitest';

import { DisplayScaleProvider } from '../../features/settings/context/DisplayScaleProvider';
import { runContentRegionScaleCommand } from '../commands/contentRegionScaleCommands';
import { APP_COMMAND_IDS } from '../commands/ids';

import { PanelScaleSurface } from './PanelScaleSurface';

beforeEach(() => window.localStorage.clear());

it('targets the active panel without shrinking its surface', async () => {
  const { container, rerender } = render(
    <DisplayScaleProvider>
      <div className="h-80 w-80">
        <PanelScaleSurface label="Folder navigation" panelId="folder-navigation">
          <button type="button">Folder</button>
        </PanelScaleSurface>
      </div>
    </DisplayScaleProvider>
  );

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Folder' }));
  act(() => {
    expect(runContentRegionScaleCommand(APP_COMMAND_IDS.increaseContentRegionScale)).toBe(true);
  });
  const scaledContent = container.querySelector('[data-panel-scale-id] > div');
  await waitFor(() => {
    expect(scaledContent).toHaveStyle({ height: '100%', width: '100%' });
    expect((scaledContent as HTMLElement).style.zoom).toBe('1.05');
    expect(screen.getByText('Folder navigation · 105%')).toBeInTheDocument();
    expect(screen.getByText('Folder navigation · 105%')).toHaveClass('text-canvas');
  });

  rerender(
    <DisplayScaleProvider>
      <PanelScaleSurface enabled={false} label="Folder navigation" panelId="folder-navigation">
        <div>PDF surface</div>
      </PanelScaleSurface>
    </DisplayScaleProvider>
  );
  await waitFor(() => {
    expect(container.querySelector('[data-panel-scale-id]')).toBeNull();
    expect(runContentRegionScaleCommand(APP_COMMAND_IDS.increaseContentRegionScale)).toBe(false);
  });
});

it('rejects nested panel scale surfaces', () => {
  expect(() => renderToStaticMarkup(
    <DisplayScaleProvider>
      <PanelScaleSurface label="Folder navigation" panelId="folder-navigation">
        <PanelScaleSurface label="Topic navigation" panelId="topic-navigation">
          <div>Topic</div>
        </PanelScaleSurface>
      </PanelScaleSurface>
    </DisplayScaleProvider>
  )).toThrow(/cannot be nested/);
});
