import { useCallback, useEffect, useState } from 'react';

import { initializeSidebarTiers, resetSidebarTierWidths } from '../../features/settings/model/sidebarLayoutPreference';
import type { SidebarRule } from '../../features/settings/model/sidebarLayoutTiers';
import { onWindowEscape } from '../../shared/platform/keyboard';
import {
  loadListCollapsedPreference, loadListWidthPreference,
  loadRightSidebarCollapsedPreference, loadRightSidebarWidthPreference
} from '../../store/workspaceLayoutPrefs';
import type { WorkspaceLayoutChromeProps } from '../components/workspaceLayoutPropGroups';

import { useActiveSidebarTier } from './useActiveSidebarTier';
import { useTierSidebarResize } from './useTierSidebarResize';

export function hasOpenSidebarMenu() {
  return Boolean(document.querySelector('[role="menu"]:not([hidden]):not([data-state="closed"])'));
}

export type WorkspaceSidebarSide = 'left' | 'right';

export interface CompactWorkspaceSidebars {
  leftFloating: boolean;
  rightFloating: boolean;
  openSide: WorkspaceSidebarSide | null;
  dismiss: () => void;
  hoverEnabled?: boolean;
  tiered?: boolean;
  edgeHoverEnabled?: boolean;
  dockedListCollapsed?: boolean;
  dockedRightCollapsed?: boolean;
  isHoverOpen?: boolean;
  openOnHover?: (side: WorkspaceSidebarSide) => void;
}

function readFloatingSidebars() {
  if (typeof window.matchMedia !== 'function') {
    return { leftFloating: false, rightFloating: false };
  }
  return {
    leftFloating: window.matchMedia('(max-width: 1080px)').matches,
    rightFloating: window.matchMedia('(max-width: 1279px)').matches
  };
}

function inheritSidebarRule(width: number, bodyWidth: number, collapsed: boolean, floating: boolean): SidebarRule {
  return {
    width: Math.min(100, Math.max(0, 100 * width / bodyWidth)),
    mode: floating ? 'edge' : collapsed ? 'closed' : 'dock'
  };
}

function useInitializeSidebarTiers(chrome: WorkspaceLayoutChromeProps, percent: number | null, initialized: boolean) {
  const { listWidth, rightSidebarWidth } = chrome;
  useEffect(() => {
    const bodyWidth = window.innerWidth - 40;
    if (initialized || percent === null || bodyWidth <= 0) return;
    const { leftFloating, rightFloating } = readFloatingSidebars();
    initializeSidebarTiers(percent, {
      left: inheritSidebarRule(loadListWidthPreference(listWidth), bodyWidth, loadListCollapsedPreference(), leftFloating),
      right: inheritSidebarRule(loadRightSidebarWidthPreference(rightSidebarWidth), bodyWidth, loadRightSidebarCollapsedPreference(), rightFloating)
    });
  }, [initialized, listWidth, percent, rightSidebarWidth]);
}

function useFloatingSidebarState(isImmersiveMode: boolean, measureWindow: boolean, tiered: boolean) {
  const [floating, setFloating] = useState(readFloatingSidebars);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    if (!measureWindow) return;
    const update = () => setWindowWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [measureWindow]);
  const [openSide, setOpenSide] = useState<WorkspaceSidebarSide | null>(null);
  const [hoverSide, setHoverSide] = useState<WorkspaceSidebarSide | null>(null);
  const dismiss = useCallback(() => {
    setOpenSide(null);
    setHoverSide(null);
  }, []);
  const openOnHover = useCallback((side: WorkspaceSidebarSide) => setHoverSide(side), []);
  useEffect(() => {
    if (tiered || typeof window.matchMedia !== 'function') return;
    const queries = ['(max-width: 1080px)', '(max-width: 1279px)'].map((query) => window.matchMedia(query));
    const update = () => {
      setFloating(readFloatingSidebars());
      dismiss();
    };
    setFloating(readFloatingSidebars());
    queries.forEach((query) => query.addEventListener('change', update));
    return () => queries.forEach((query) => query.removeEventListener('change', update));
  }, [dismiss, tiered]);
  useEffect(() => {
    if (isImmersiveMode) dismiss();
  }, [dismiss, isImmersiveMode]);
  useEffect(() => {
    if (!openSide && !hoverSide) return;
    return onWindowEscape(() => {
      if (hasOpenSidebarMenu()) return false;
      dismiss();
      return true;
    });
  }, [dismiss, hoverSide, openSide]);
  return { floating, openSide, setOpenSide, dismiss, windowWidth, hoverSide, openOnHover };
}

function resolvePdfSidebarPlacement(
  chrome: WorkspaceLayoutChromeProps, compact: ReturnType<typeof readFloatingSidebars>, pdfWidth: number, windowWidth: number
) {
  if (!pdfWidth || chrome.isImmersiveMode) return compact;
  const listDockWidth = chrome.listWidth + 1;
  const rightDockWidth = chrome.rightSidebarWidth + 1;
  const listWidth = compact.leftFloating || chrome.isListCollapsed ? 0 : listDockWidth;
  const rightWidth = compact.rightFloating || chrome.isRightSidebarCollapsed ? 0 : rightDockWidth;
  const contentWidth = windowWidth - 40 - listWidth - rightWidth;
  return {
    leftFloating: compact.leftFloating || pdfWidth > contentWidth + rightWidth + listWidth - listDockWidth,
    rightFloating: compact.rightFloating || pdfWidth > contentWidth + rightWidth - rightDockWidth
  };
}

function resolveFloatingSidebars(
  chrome: WorkspaceLayoutChromeProps,
  rules: ReturnType<typeof useActiveSidebarTier>,
  legacy: ReturnType<typeof readFloatingSidebars>,
  pdfWidth: number,
  windowWidth: number
) {
  if (!rules.tier) return resolvePdfSidebarPlacement(chrome, legacy, pdfWidth, windowWidth);
  const floating = resolvePdfSidebarPlacement(chrome, {
    leftFloating: rules.left === 'edge', rightFloating: rules.right === 'edge'
  }, pdfWidth, windowWidth);
  return {
    leftFloating: rules.left !== 'closed' && floating.leftFloating,
    rightFloating: rules.right !== 'closed' && floating.rightFloating
  };
}

function projectSidebarTier(chrome: WorkspaceLayoutChromeProps, rules: ReturnType<typeof useActiveSidebarTier>, width: number, resize: ReturnType<typeof useTierSidebarResize>): WorkspaceLayoutChromeProps {
  const { tier, percent } = rules;
  if (!tier || percent === null) return chrome;
  return {
    ...chrome,
    listWidth: width * (resize.draft?.side === 'left' ? resize.draft.width : tier.left.width) / 100,
    rightSidebarWidth: width * (resize.draft?.side === 'right' ? resize.draft.width : tier.right.width) / 100,
    onResetLayout: () => resetSidebarTierWidths(tier.id, percent),
    onSplitterPointerDown: event => resize.start('left', event),
    onSplitterKeyDown: event => resize.keyDown('left', event),
    onRightSidebarSplitterPointerDown: event => resize.start('right', event),
    onRightSidebarSplitterKeyDown: event => resize.keyDown('right', event),
    isListCollapsed: rules.left !== 'dock',
    isRightSidebarCollapsed: rules.right !== 'dock'
  };
}

export function useCompactWorkspaceSidebars(chrome: WorkspaceLayoutChromeProps, pdfWidth = 0): WorkspaceLayoutChromeProps {
  const rules = useActiveSidebarTier();
  const active = rules.tier;
  useInitializeSidebarTiers(chrome, rules.percent, Boolean(active));
  const state = useFloatingSidebarState(chrome.isImmersiveMode, pdfWidth > 0 || Boolean(active), Boolean(active));
  const bodyWidth = Math.max(0, state.windowWidth - 40);
  const resize = useTierSidebarResize(active, bodyWidth);
  const projected = projectSidebarTier(chrome, rules, bodyWidth, resize);
  const floating = resolveFloatingSidebars(projected, rules, state.floating, pdfWidth, state.windowWidth);
  const { dismiss, setOpenSide } = state;
  const hoverEnabled = pdfWidth > 0 && !chrome.isImmersiveMode;
  const edgeHoverEnabled = Boolean(active) || hoverEnabled;
  const requestedSide = state.openSide ?? (edgeHoverEnabled ? state.hoverSide : null);
  const tierId = active?.id;
  useEffect(() => { dismiss(); }, [dismiss, tierId]);
  const openSide = (requestedSide === 'left' && floating.leftFloating) ||
    (requestedSide === 'right' && floating.rightFloating) ? requestedSide : null;
  useEffect(() => {
    if ((!edgeHoverEnabled && state.hoverSide) || (requestedSide && !openSide)) dismiss();
  }, [dismiss, edgeHoverEnabled, openSide, requestedSide, state.hoverSide]);
  const toggle = (side: WorkspaceSidebarSide, dockedToggle: () => void) => {
    if (active) {
      dismiss();
      rules.toggle(side);
      return;
    }
    if (side === 'left' ? floating.leftFloating : floating.rightFloating) {
      dismiss();
      setOpenSide(openSide === side && state.openSide ? null : side);
    } else {
      dismiss();
      dockedToggle();
    }
  };
  return {
    ...projected,
    compactSidebars: { ...floating, openSide, dismiss, hoverEnabled, tiered: Boolean(active), edgeHoverEnabled, dockedListCollapsed: projected.isListCollapsed,
      dockedRightCollapsed: projected.isRightSidebarCollapsed, isHoverOpen: Boolean(openSide && !state.openSide), openOnHover: state.openOnHover },
    isListCollapsed: floating.leftFloating ? openSide !== 'left' : projected.isListCollapsed,
    isRightSidebarCollapsed: floating.rightFloating ? openSide !== 'right' : projected.isRightSidebarCollapsed,
    onToggleListVisibility: () => toggle('left', chrome.onToggleListVisibility),
    onToggleRightSidebarVisibility: () => toggle('right', chrome.onToggleRightSidebarVisibility),
    onToggleBothSidebarVisibility: () => {
      if (active) {
        dismiss();
        rules.toggleBoth();
      } else if (floating.leftFloating && openSide) dismiss();
      else if (floating.leftFloating) setOpenSide('left');
      else if (floating.rightFloating) toggle('right', chrome.onToggleRightSidebarVisibility);
      else chrome.onToggleBothSidebarVisibility();
    }
  };
}
