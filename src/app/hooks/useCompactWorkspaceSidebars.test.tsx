import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceLayoutChromeProps } from '../components/workspaceLayoutPropGroups';

import { useCompactWorkspaceSidebars } from './useCompactWorkspaceSidebars';

function createChrome(): WorkspaceLayoutChromeProps {
  return {
    isImmersiveMode: false,
    isResizingList: false,
    isResizingRightSidebar: false,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    listWidth: 484,
    rightSidebarWidth: 320,
    onResetLayout: vi.fn(),
    onSplitterKeyDown: vi.fn(),
    onSplitterPointerDown: vi.fn(),
    onRightSidebarSplitterKeyDown: vi.fn(),
    onRightSidebarSplitterPointerDown: vi.fn(),
    onEnterImmersiveEdit: vi.fn(),
    onEnterImmersiveMode: vi.fn(),
    onExitImmersiveMode: vi.fn(),
    onToggleImmersiveMode: vi.fn(),
    onToggleListVisibility: vi.fn(),
    onToggleBothSidebarVisibility: vi.fn(),
    onToggleRightSidebarVisibility: vi.fn()
  };
}

function installViewport(initialWidth: number) {
  let width = initialWidth;
  const queries = new Map<string, MediaQueryList>();
  vi.stubGlobal('matchMedia', (query: string) => {
    const existing = queries.get(query);
    if (existing) return existing;
    const events = new EventTarget();
    const media: MediaQueryList = {
      media: query,
      get matches() { return width <= (query.includes('1080') ? 1080 : 1279); },
      onchange: null,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
      addListener: vi.fn(),
      removeListener: vi.fn()
    };
    queries.set(query, media);
    return media;
  });
  return (nextWidth: number) => act(() => {
    const previous = [...queries.values()].map((query) => query.matches);
    width = nextWidth;
    [...queries.values()].forEach((query, index) => {
      if (previous[index] !== query.matches) query.dispatchEvent(new Event('change'));
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

it('keeps sidebars docked when media queries are unavailable', () => {
  vi.stubGlobal('matchMedia', undefined);
  const chrome = createChrome();
  const { result } = renderHook(() => useCompactWorkspaceSidebars(chrome));

  expect(result.current.isListCollapsed).toBe(false);
  expect(result.current.isRightSidebarCollapsed).toBe(false);
  act(() => result.current.onToggleListVisibility());
  expect(chrome.onToggleListVisibility).toHaveBeenCalledOnce();
});

it('opens one temporary sidebar at a time without changing docked preferences', () => {
  installViewport(1000);
  const chrome = createChrome();
  const { result } = renderHook(() => useCompactWorkspaceSidebars(chrome));
  expect(result.current.isListCollapsed).toBe(true);
  expect(result.current.isRightSidebarCollapsed).toBe(true);
  act(() => result.current.onToggleListVisibility());
  expect(result.current.isListCollapsed).toBe(false);
  act(() => result.current.onToggleRightSidebarVisibility());
  expect(result.current.isListCollapsed).toBe(true);
  expect(result.current.isRightSidebarCollapsed).toBe(false);
  act(() => result.current.onToggleRightSidebarVisibility());
  expect(result.current.isRightSidebarCollapsed).toBe(true);
  expect(chrome.onToggleListVisibility).not.toHaveBeenCalled();
  expect(chrome.onToggleRightSidebarVisibility).not.toHaveBeenCalled();
});

it('dismisses temporary sidebars through Escape, outside dismissal and the combined command', () => {
  installViewport(1000);
  const { result } = renderHook(() => useCompactWorkspaceSidebars(createChrome()));
  act(() => result.current.onToggleBothSidebarVisibility());
  expect(result.current.isListCollapsed).toBe(false);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(result.current.isListCollapsed).toBe(true);
  act(() => result.current.onToggleRightSidebarVisibility());
  act(() => result.current.compactSidebars?.dismiss());
  expect(result.current.isRightSidebarCollapsed).toBe(true);
  act(() => result.current.onToggleRightSidebarVisibility());
  act(() => result.current.onToggleBothSidebarVisibility());
  expect(result.current.isRightSidebarCollapsed).toBe(true);
});

it('restores docked visibility on widening and clears temporary state on breakpoint changes', () => {
  const resize = installViewport(1000);
  const chrome = { ...createChrome(), isRightSidebarCollapsed: true };
  const { result } = renderHook(() => useCompactWorkspaceSidebars(chrome));
  act(() => result.current.onToggleRightSidebarVisibility());
  resize(1400);
  expect(result.current.isListCollapsed).toBe(false);
  expect(result.current.isRightSidebarCollapsed).toBe(true);
  act(() => result.current.onToggleBothSidebarVisibility());
  expect(chrome.onToggleBothSidebarVisibility).toHaveBeenCalledOnce();
  resize(1000);
  expect(result.current.isListCollapsed).toBe(true);
  expect(result.current.isRightSidebarCollapsed).toBe(true);
});

it('keeps the left sidebar docked in medium windows and closes overlays in immersive mode', () => {
  installViewport(1200);
  const chrome = createChrome();
  const { result, rerender } = renderHook((props) => useCompactWorkspaceSidebars(props), { initialProps: chrome });
  act(() => result.current.onToggleListVisibility());
  expect(chrome.onToggleListVisibility).toHaveBeenCalledOnce();
  act(() => result.current.onToggleBothSidebarVisibility());
  expect(result.current.isRightSidebarCollapsed).toBe(false);
  rerender({ ...chrome, isImmersiveMode: true });
  expect(result.current.compactSidebars?.openSide).toBeNull();
});
