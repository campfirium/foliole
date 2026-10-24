import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore,
  type Dispatch, type ReactNode, type SetStateAction } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionNavigationResume, saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { restoreCompanionNavigation, type CompanionNavigationState } from './companionNavigationState';
import { CompanionWorkspaceSyncLoading } from './CompanionWorkspaceSyncLoading';

type Navigation = { flush(): Promise<void>; state: CompanionNavigationState; setState: Dispatch<SetStateAction<CompanionNavigationState>> };
const Context = createContext<Navigation | null>(null);

export function useCompanionNavigationField<K extends keyof CompanionNavigationState>(
  key: K, initial: CompanionNavigationState[K]
): [CompanionNavigationState[K], Dispatch<SetStateAction<CompanionNavigationState[K]>>] {
  const navigation = useContext(Context);
  const [local, setLocal] = useState(initial);
  const setNavigation = navigation?.setState;
  const setValue = useCallback<Dispatch<SetStateAction<CompanionNavigationState[K]>>>((value) => {
    if (!setNavigation) { setLocal(value); return; }
    setNavigation(current => ({ ...current,
      [key]: typeof value === 'function' ? value(current[key]) : value }));
  }, [key, setNavigation]);
  return [navigation ? navigation.state[key] : local, setValue];
}

const noPendingNavigation = async () => {};
export function useCompanionNavigationFlush() { return useContext(Context)?.flush ?? noPendingNavigation; }

export function useHasCompanionNavigation() { return useContext(Context) !== null; }

export function CompanionNavigationProvider(props: {
  children: ReactNode; ready: boolean; snapshot: WorkspaceSnapshot | null; libraryScope: string;
}) {
  const scope = useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope);
  if (!isAvailableNativeCompanionRuntime()) return <>{props.children}</>;
  // Database replacement retires the entire navigation owner and its in-flight hydration.
  return <NavigationOwner key={props.libraryScope} {...props} scope={scope} />;
}

function NavigationOwner(props: {
  children: ReactNode; ready: boolean; snapshot: WorkspaceSnapshot | null; libraryScope: string; scope: object;
}) {
  const [loaded, setLoaded] = useState<{ scope: object; state: CompanionNavigationState } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback(() => pendingWrite.current, []);
  const hasWorkspace = Boolean(props.snapshot);
  useEffect(() => {
    if (!props.ready) return;
    let cancelled = false;
    void loadCompanionNavigationResume(props.libraryScope).then(value => {
      if (!cancelled) setLoaded({ scope: props.scope, state: restoreCompanionNavigation(value, props.snapshot) });
    }).catch(reason => { if (!cancelled) setError(reason); });
    return () => { cancelled = true; };
    // Snapshot refreshes do not replace user-owned navigation.
  }, [props.ready, props.libraryScope, props.scope, hasWorkspace]);
  const setState = useCallback<Dispatch<SetStateAction<CompanionNavigationState>>>(update => {
    setLoaded(current => current ? { ...current,
      state: typeof update === 'function' ? update(current.state) : update } : current);
  }, []);
  useEffect(() => {
    if (!props.ready || !loaded || loaded.scope !== props.scope) return;
    pendingWrite.current = saveCompanionNavigationResume(props.libraryScope, JSON.stringify(loaded.state));
    void pendingWrite.current.catch(setError);
  }, [loaded, props.ready, props.libraryScope, props.scope]);
  if (error) throw error;
  if (!props.ready || !loaded || loaded.scope !== props.scope) return <CompanionWorkspaceSyncLoading />;
  return <Context.Provider value={{ state: loaded.state, setState, flush }}>{props.children}</Context.Provider>;
}
