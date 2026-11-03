import { useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { CompanionRestoredShell } from './CompanionRestoredShell';
import { createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionWorkspaceLoaders } from './useCompanionWorkspaceLoaders';
import { useCompanionWorkspaceState } from './useCompanionWorkspaceState';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function ReadingLibraryShell(props: { snapshot: WorkspaceSnapshot }) {
  const [readableArticle, setReadableArticle] = useState<ReturnType<typeof useCompanionWorkspaceSync>['readableArticle']>(null);
  const base = createWorkspaceSync(props.snapshot);
  const [state, setState] = useCompanionWorkspaceState(base.state);
  const loader = useCompanionWorkspaceLoaders({ state, setState, setReadableArticle, setError: () => {} });
  const workspaceSync = { ...base, ...loader, state, readableArticle,
    refreshAfterMutation: async () => {
      const next = await loadCompanionWorkspaceSyncState();
      setState(next);
      return next.workspace_snapshot;
    }
  };
  if (!state.workspace_snapshot) return null;
  return <LocalizationProvider initialLanguagePreference="en">
    <CompanionNavigationProvider ready snapshot={state.workspace_snapshot} libraryScope={state.workspace_snapshot!.libraryScope!}>
      <MouseGestureSettingsProvider>
        <CompanionRestoredShell bootstrapState={base.bootstrapState} workspaceSync={workspaceSync} />
      </MouseGestureSettingsProvider>
    </CompanionNavigationProvider>
  </LocalizationProvider>;
}

export function installReadingRangeGeometry() {
  const descriptors = ['getClientRects', 'getBoundingClientRect'].map(name => [name, Object.getOwnPropertyDescriptor(Range.prototype, name)] as const);
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  return () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
      else Reflect.deleteProperty(Range.prototype, name);
    }
  };
}
