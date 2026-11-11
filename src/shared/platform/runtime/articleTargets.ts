import { useEffect, useSyncExternalStore } from 'react';

import type { ArticleTargetSettings } from '../../../../lib/platform/articleTarget';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { Translate } from '../../localization/LocalizationProvider';
import { getRuntimeInvoke } from '../runtimeInvoke';

const initial: ArticleTargetSettings = { selected: { id: 'edge', name: 'Edge' }, available: [] };
const listeners = new Set<() => void>();
let current = initial;
let loading: Promise<void> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function snapshot() {
  return current;
}

function publish(settings: ArticleTargetSettings) {
  current = settings;
  listeners.forEach((listener) => listener());
}

export function refreshArticleTargets() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return Promise.resolve();
  loading ??= invoke(NATIVE_COMMANDS.loadArticleTargets)
    .then(publish)
    .catch(() => undefined)
    .finally(() => { loading = null; });
  return loading;
}

export async function changeArticleTarget(id: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return;
  await loading;
  publish(await invoke(NATIVE_COMMANDS.selectArticleTarget, { id }));
}

export function useArticleTargets() {
  const settings = useSyncExternalStore(subscribe, snapshot, () => initial);
  useEffect(() => {
    if (current === initial) void refreshArticleTargets();
  }, []);
  return settings;
}

export function getSendArticleTitle(t: Translate) {
  const target = current.selected;
  return target ? t('desktop.command.sendToEdge', { app: target.name }) : t('desktop.command.chooseArticleTarget');
}
