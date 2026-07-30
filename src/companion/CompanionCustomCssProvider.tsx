import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from 'react';

import type { NativeCompanionRuntimeKind } from '../../lib/platform/nativeCompanionContract';
import {
  loadCompanionSyncSettingValueJson,
  saveCompanionSyncSettingRecord
} from '../shared/platform/companionSyncObjects';

import {
  compileCompanionCustomCssCollection,
  type CompiledCompanionCustomCssCollection
} from './companionCustomCssCompiler';
import {
  COMPANION_CUSTOM_CSS_SETTING_KEY,
  createEmptyCompanionCustomCssCollection,
  type CompanionCustomCssCollection
} from './companionCustomCssModel';
import {
  loadCompanionCustomCssCache,
  saveCompanionCustomCssCache
} from './companionCustomCssStorage';

export type CompanionCustomCssIssue = 'invalid' | 'save' | 'sync';
export type CompanionCustomCssSaveResult =
  | { ok: true }
  | { kind: 'invalid' | 'save' | 'unavailable'; ok: false };

interface CompanionCustomCssContextValue {
  collection: CompanionCustomCssCollection;
  compiledCss: string;
  isSupported: boolean;
  issue: CompanionCustomCssIssue | null;
  markDraftEdited(): void;
  resetCollection(): Promise<CompanionCustomCssSaveResult>;
  saveCollection(collection: CompanionCustomCssCollection): Promise<CompanionCustomCssSaveResult>;
}

interface ProviderState {
  compiled: CompiledCompanionCustomCssCollection;
  issue: CompanionCustomCssIssue | null;
}

const CompanionCustomCssContext = createContext<CompanionCustomCssContextValue | null>(null);

function compileEmptyCollection() {
  return compileCompanionCustomCssCollection(createEmptyCompanionCustomCssCollection());
}

function createInitialState(runtimeKind: NativeCompanionRuntimeKind): ProviderState {
  if (runtimeKind === 'ios-capacitor') return { compiled: compileEmptyCollection(), issue: null };
  const cached = loadCompanionCustomCssCache();
  if (cached.kind === 'valid') return { compiled: cached.compiled, issue: null };
  return { compiled: compileEmptyCollection(), issue: cached.kind === 'invalid' ? 'invalid' : null };
}

function parseNativeCollection(valueJson: string) {
  return compileCompanionCustomCssCollection(JSON.parse(valueJson));
}

function useCustomCssStyleNode(isSupported: boolean, compiledCss: string) {
  const styleNodeRef = useRef<HTMLStyleElement | null>(null);
  useEffect(() => {
    if (!isSupported) return undefined;
    const styleNode = document.createElement('style');
    styleNode.dataset.companionCustomCss = 'true';
    styleNode.textContent = '';
    document.head.append(styleNode);
    styleNodeRef.current = styleNode;
    return () => {
      styleNode.remove();
      if (styleNodeRef.current === styleNode) styleNodeRef.current = null;
    };
  }, [isSupported]);

  useEffect(() => {
    if (styleNodeRef.current) styleNodeRef.current.textContent = compiledCss;
  }, [compiledCss]);
}

function applyNativeCollection(valueJson: string, setState: Dispatch<SetStateAction<ProviderState>>) {
  try {
    const compiled = parseNativeCollection(valueJson);
    try {
      saveCompanionCustomCssCache(compiled.collection);
      setState({ compiled, issue: null });
    } catch {
      setState({ compiled, issue: 'save' });
    }
  } catch {
    setState({ compiled: compileEmptyCollection(), issue: 'invalid' });
  }
}

function useAndroidCustomCssHydration(args: {
  isAndroid: boolean;
  refreshKey?: string | null;
  revisionRef: MutableRefObject<number>;
  setState: Dispatch<SetStateAction<ProviderState>>;
}) {
  useEffect(() => {
    if (!args.isAndroid) return undefined;
    let cancelled = false;
    const hydrationRevision = args.revisionRef.current;
    void loadCompanionSyncSettingValueJson(COMPANION_CUSTOM_CSS_SETTING_KEY).then((valueJson) => {
      if (cancelled || args.revisionRef.current !== hydrationRevision) return;
      if (valueJson === null) {
        args.setState((current) => ({ ...current, issue: current.issue === 'sync' ? null : current.issue }));
        return;
      }
      applyNativeCollection(valueJson, args.setState);
    }).catch(() => {
      if (!cancelled && args.revisionRef.current === hydrationRevision) {
        args.setState((current) => ({ ...current, issue: 'sync' }));
      }
    });
    return () => { cancelled = true; };
  }, [args.isAndroid, args.refreshKey, args.revisionRef, args.setState]);
}

function useSaveCustomCssCollection(args: {
  isAndroid: boolean;
  isSupported: boolean;
  revisionRef: MutableRefObject<number>;
  setState: Dispatch<SetStateAction<ProviderState>>;
}) {
  return useCallback(async (collection: CompanionCustomCssCollection): Promise<CompanionCustomCssSaveResult> => {
    let compiled: CompiledCompanionCustomCssCollection;
    try {
      compiled = compileCompanionCustomCssCollection(collection);
    } catch {
      return { kind: 'invalid', ok: false };
    }
    if (!args.isSupported) return { kind: 'unavailable', ok: false };
    const saveRevision = args.revisionRef.current + 1;
    args.revisionRef.current = saveRevision;
    try {
      if (args.isAndroid) {
        const nativeResult = await saveCompanionSyncSettingRecord({
          key: COMPANION_CUSTOM_CSS_SETTING_KEY,
          valueJson: JSON.stringify(compiled.collection)
        });
        if (nativeResult === null) throw new Error('Custom style setting write is unavailable.');
      }
      saveCompanionCustomCssCache(compiled.collection);
      if (args.revisionRef.current === saveRevision) args.setState({ compiled, issue: null });
      return { ok: true };
    } catch {
      if (args.revisionRef.current === saveRevision) {
        args.setState((current) => ({ ...current, issue: 'save' }));
      }
      return { kind: 'save', ok: false };
    }
  }, [args.isAndroid, args.isSupported, args.revisionRef, args.setState]);
}

export function CompanionCustomCssProvider(props: {
  children: ReactNode;
  refreshKey?: string | null;
  runtimeKind: NativeCompanionRuntimeKind;
}) {
  const isSupported = props.runtimeKind !== 'ios-capacitor';
  const isAndroid = props.runtimeKind === 'android-capacitor';
  const [state, setState] = useState(() => createInitialState(props.runtimeKind));
  const revisionRef = useRef(0);
  useCustomCssStyleNode(isSupported, state.compiled.compiledCss);
  useAndroidCustomCssHydration({ isAndroid, refreshKey: props.refreshKey ?? null, revisionRef, setState });
  const saveCollection = useSaveCustomCssCollection({ isAndroid, isSupported, revisionRef, setState });
  const markDraftEdited = useCallback(() => { revisionRef.current += 1; }, []);

  const resetCollection = useCallback(
    () => saveCollection(createEmptyCompanionCustomCssCollection()),
    [saveCollection]
  );

  const value = useMemo<CompanionCustomCssContextValue>(() => ({
    collection: state.compiled.collection,
    compiledCss: state.compiled.compiledCss,
    isSupported,
    issue: state.issue,
    markDraftEdited,
    resetCollection,
    saveCollection
  }), [isSupported, markDraftEdited, resetCollection, saveCollection, state]);

  return <CompanionCustomCssContext.Provider value={value}>{props.children}</CompanionCustomCssContext.Provider>;
}

export function useCompanionCustomCss() {
  const value = useContext(CompanionCustomCssContext);
  if (!value) throw new Error('CompanionCustomCssProvider is missing.');
  return value;
}

export function useOptionalCompanionCustomCss() {
  return useContext(CompanionCustomCssContext);
}
