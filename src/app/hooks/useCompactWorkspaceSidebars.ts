import { useCallback, useEffect, useState } from 'react';

import { onWindowEscape } from '../../shared/platform/keyboard';
import type { WorkspaceLayoutChromeProps } from '../components/workspaceLayoutPropGroups';

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

function useFloatingSidebarState(isImmersiveMode: boolean, pdfWidth: number) {
  const [floating, setFloating] = useState(readFloatingSidebars);
  const measureWindow = pdfWidth > 0;
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
    if (typeof window.matchMedia !== 'function') return;
    const queries = ['(max-width: 1080px)', '(max-width: 1279px)'].map((query) => window.matchMedia(query));
    const update = () => {
      setFloating(readFloatingSidebars());
      dismiss();
    };
    queries.forEach((query) => query.addEventListener('change', update));
    return () => queries.forEach((query) => query.removeEventListener('change', update));
  }, [dismiss]);
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

function resolveFloatingSidebars(
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

export function useCompactWorkspaceSidebars(chrome: WorkspaceLayoutChromeProps, pdfWidth = 0): WorkspaceLayoutChromeProps {
  const state = useFloatingSidebarState(chrome.isImmersiveMode, pdfWidth);
  const floating = resolveFloatingSidebars(chrome, state.floating, pdfWidth, state.windowWidth);
  const { dismiss, setOpenSide } = state;
  const hoverEnabled = pdfWidth > 0 && !chrome.isImmersiveMode;
  const requestedSide = state.openSide ?? (hoverEnabled ? state.hoverSide : null);
  const openSide = (requestedSide === 'left' && floating.leftFloating) ||
    (requestedSide === 'right' && floating.rightFloating) ? requestedSide : null;
  useEffect(() => {
    if ((!hoverEnabled && state.hoverSide) || (requestedSide && !openSide)) dismiss();
  }, [dismiss, hoverEnabled, openSide, requestedSide, state.hoverSide]);
  const toggle = (side: WorkspaceSidebarSide, dockedToggle: () => void) => {
    if (side === 'left' ? floating.leftFloating : floating.rightFloating) {
      dismiss();
      setOpenSide(openSide === side && state.openSide ? null : side);
    } else {
      dismiss();
      dockedToggle();
    }
  };
  return {
    ...chrome,
    compactSidebars: { ...floating, openSide, dismiss, hoverEnabled, dockedListCollapsed: chrome.isListCollapsed,
      dockedRightCollapsed: chrome.isRightSidebarCollapsed, isHoverOpen: Boolean(openSide && !state.openSide), openOnHover: state.openOnHover },
    isListCollapsed: floating.leftFloating ? openSide !== 'left' : chrome.isListCollapsed,
    isRightSidebarCollapsed: floating.rightFloating ? openSide !== 'right' : chrome.isRightSidebarCollapsed,
    onToggleListVisibility: () => toggle('left', chrome.onToggleListVisibility),
    onToggleRightSidebarVisibility: () => toggle('right', chrome.onToggleRightSidebarVisibility),
    onToggleBothSidebarVisibility: () => {
      if (floating.leftFloating && openSide) dismiss();
      else if (floating.leftFloating) setOpenSide('left');
      else if (floating.rightFloating) toggle('right', chrome.onToggleRightSidebarVisibility);
      else chrome.onToggleBothSidebarVisibility();
    }
  };
}
