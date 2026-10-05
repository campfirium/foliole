import { useCallback, useEffect, useState } from 'react';

import { onWindowEscape } from '../../shared/platform/keyboard';
import type { WorkspaceLayoutChromeProps } from '../components/workspaceLayoutPropGroups';

export type WorkspaceSidebarSide = 'left' | 'right';

export interface CompactWorkspaceSidebars {
  leftFloating: boolean;
  rightFloating: boolean;
  openSide: WorkspaceSidebarSide | null;
  dismiss: () => void;
}

function readFloatingSidebars() {
  return {
    leftFloating: window.matchMedia('(max-width: 1080px)').matches,
    rightFloating: window.matchMedia('(max-width: 1279px)').matches
  };
}

function useFloatingSidebarState(isImmersiveMode: boolean) {
  const [floating, setFloating] = useState(readFloatingSidebars);
  const [openSide, setOpenSide] = useState<WorkspaceSidebarSide | null>(null);
  const dismiss = useCallback(() => setOpenSide(null), []);
  useEffect(() => {
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
    if (!openSide) return;
    return onWindowEscape(() => {
      dismiss();
      return true;
    });
  }, [dismiss, openSide]);
  return { floating, openSide, setOpenSide, dismiss };
}

export function useCompactWorkspaceSidebars(chrome: WorkspaceLayoutChromeProps): WorkspaceLayoutChromeProps {
  const { floating, openSide, setOpenSide, dismiss } = useFloatingSidebarState(chrome.isImmersiveMode);
  const toggle = (side: WorkspaceSidebarSide, dockedToggle: () => void) => {
    if (side === 'left' ? floating.leftFloating : floating.rightFloating) {
      setOpenSide((current) => current === side ? null : side);
    } else {
      dismiss();
      dockedToggle();
    }
  };
  return {
    ...chrome,
    compactSidebars: { ...floating, openSide, dismiss },
    isListCollapsed: floating.leftFloating ? openSide !== 'left' : chrome.isListCollapsed,
    isRightSidebarCollapsed: floating.rightFloating ? openSide !== 'right' : chrome.isRightSidebarCollapsed,
    onToggleListVisibility: () => toggle('left', chrome.onToggleListVisibility),
    onToggleRightSidebarVisibility: () => toggle('right', chrome.onToggleRightSidebarVisibility),
    onToggleBothSidebarVisibility: () => {
      if (floating.leftFloating) setOpenSide((current) => current ? null : 'left');
      else if (floating.rightFloating) toggle('right', chrome.onToggleRightSidebarVisibility);
      else chrome.onToggleBothSidebarVisibility();
    }
  };
}
