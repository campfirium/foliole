import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

import { compileCompanionCustomCssSource } from '../../../shared/customCss/companionCustomCssCompiler';
import { listCssSnippetFiles } from '../../../shared/platform/desktop/cssSnippetFiles';
import { isDesktopRuntime } from '../../../shared/platform/runtime';

const ENABLED_KEY_PREFIX = 'foliole-desktop-css-snippet-files:';

function compileFile(sourceCss: string | null) {
  if (sourceCss === null) return null;
  try {
    return compileCompanionCustomCssSource(sourceCss);
  } catch {
    return null;
  }
}

async function loadSnippets() {
  const { path, files } = await listCssSnippetFiles();
  const key = ENABLED_KEY_PREFIX + path;
  const raw: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
  const enabled = new Set<string>(Array.isArray(raw) ? raw.filter((name) => typeof name === 'string') : []);
  return { key, enabled, files: files.map(({ name, sourceCss }) => ({ name, css: compileFile(sourceCss) })) };
}

function useDesktopCssController() {
  const [snippets, setSnippets] = useState<Awaited<ReturnType<typeof loadSnippets>> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      setSnippets(await loadSnippets());
    } catch {
      setSnippets(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const css = snippets?.files.filter(({ name }) => snippets.enabled.has(name)).map((file) => file.css ?? '').join('\n');
  useLayoutEffect(() => {
    if (!css?.trim()) return;
    const style = document.createElement('style');
    style.dataset.desktopCustomCss = 'true';
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  }, [css]);

  function toggle(name: string) {
    if (!snippets) return;
    const enabled = new Set(snippets.enabled);
    if (!enabled.delete(name)) enabled.add(name);
    try {
      window.localStorage.setItem(snippets.key, JSON.stringify([...enabled]));
      setSnippets({ ...snippets, enabled });
      setError(false);
    } catch {
      setError(true);
    }
  }

  return {
    busy, error, refresh, toggle,
    files: snippets?.files.map(({ name, css }) => ({
      name, valid: css !== null, enabled: snippets.enabled.has(name)
    })) ?? []
  };
}

const DesktopCustomCssContext = createContext<ReturnType<typeof useDesktopCssController> | null>(null);

function DesktopCustomCssRuntime({ children }: { children: ReactNode }) {
  const controller = useDesktopCssController();
  return <DesktopCustomCssContext.Provider value={controller}>{children}</DesktopCustomCssContext.Provider>;
}

export function DesktopCustomCssProvider({ children }: { children: ReactNode }) {
  return isDesktopRuntime() ? <DesktopCustomCssRuntime>{children}</DesktopCustomCssRuntime> : children;
}

export function useDesktopCustomCss() {
  return useContext(DesktopCustomCssContext);
}
