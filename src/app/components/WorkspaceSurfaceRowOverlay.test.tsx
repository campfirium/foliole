import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppearanceSettingsContext, type AppearanceSettingsContextValue } from '../../features/settings/context/appearanceSettingsContext';
import {
  DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
  DEFAULT_WORKSPACE_SURFACE_PALETTE
} from '../../features/settings/model/appearanceSettings';

import { WorkspaceFooterRowDividers, WorkspaceSurfaceRowOverlay } from './WorkspaceSurfaceRowOverlay';

function createAppearanceContext(): AppearanceSettingsContextValue {
  return {
    workspaceSurfaceAssignments: {
      ...DEFAULT_WORKSPACE_SURFACE_ASSIGNMENTS,
      'footer-folder': 0,
      'footer-topic': 1
    },
    workspaceSurfacePalette: ['#ffffff', '#000000', ...DEFAULT_WORKSPACE_SURFACE_PALETTE]
  } as AppearanceSettingsContextValue;
}

it('ties footer surface columns to the current list folder width', () => {
  const { container } = render(<WorkspaceSurfaceRowOverlay row="footer" />);

  expect(container.firstElementChild?.getAttribute('style')).toContain('--workspace-list-folder-current-width');
});

it('hides the footer folder divider when the list sidebar is collapsed', () => {
  const { container } = render(
    <AppearanceSettingsContext.Provider value={createAppearanceContext()}>
      <WorkspaceFooterRowDividers isListCollapsed />
    </AppearanceSettingsContext.Provider>
  );

  expect(container.firstElementChild).toBeNull();
});

it('places the footer folder divider at the current list folder edge', () => {
  const { container } = render(
    <AppearanceSettingsContext.Provider value={createAppearanceContext()}>
      <WorkspaceFooterRowDividers isListCollapsed={false} />
    </AppearanceSettingsContext.Provider>
  );

  expect(container.firstElementChild).toHaveStyle({
    left: 'calc(var(--workspace-rail-width) + var(--workspace-list-folder-current-width, var(--workspace-folder-column-width)))'
  });
});
