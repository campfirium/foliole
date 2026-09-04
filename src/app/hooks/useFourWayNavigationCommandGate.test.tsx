import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { useFourWayNavigationCommandGate } from './useFourWayNavigationCommandGate';

afterEach(() => {
  document.querySelectorAll('[data-navigation-gate-test]').forEach((element) => element.remove());
});

it('blocks four-way navigation during composition and allows it after composition ends', () => {
  const runCommand = vi.fn();
  const { result } = renderHook(() => useFourWayNavigationCommandGate({
    isCommandSurfaceOpen: false,
    runCommand
  }));

  act(() => window.dispatchEvent(new CompositionEvent('compositionstart')));
  result.current(APP_COMMAND_IDS.goBack);
  expect(runCommand).not.toHaveBeenCalled();

  act(() => window.dispatchEvent(new CompositionEvent('compositionend')));
  result.current(APP_COMMAND_IDS.goBack);
  expect(runCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.goBack);
});

it('blocks native or DOM navigation while an app modal surface is open', () => {
  const modal = document.createElement('section');
  modal.dataset.navigationGateTest = 'true';
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('role', 'dialog');
  document.body.append(modal);
  const runCommand = vi.fn();
  const { result } = renderHook(() => useFourWayNavigationCommandGate({
    isCommandSurfaceOpen: false,
    runCommand
  }));

  result.current(APP_COMMAND_IDS.goToLastChild);
  result.current(APP_COMMAND_IDS.toggleList);

  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(runCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.toggleList);
});

it('allows navigation while a dismissed modal finishes its exit animation', () => {
  const modal = document.createElement('section');
  modal.dataset.navigationGateTest = 'true';
  modal.dataset.state = 'closed';
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('role', 'dialog');
  document.body.append(modal);
  const runCommand = vi.fn();
  const { result } = renderHook(() => useFourWayNavigationCommandGate({
    isCommandSurfaceOpen: false,
    runCommand
  }));

  result.current(APP_COMMAND_IDS.goBack);

  expect(runCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.goBack);
});

it('blocks four-way navigation while a command surface is open', () => {
  const runCommand = vi.fn();
  const { result } = renderHook(() => useFourWayNavigationCommandGate({
    isCommandSurfaceOpen: true,
    runCommand
  }));

  result.current(APP_COMMAND_IDS.goParent);
  expect(runCommand).not.toHaveBeenCalled();
});
