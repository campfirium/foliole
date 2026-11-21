import { act, fireEvent, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { StartupErrorBoundary } from '../shared/ui/StartupErrorBoundary';

import { closeForCompanionLibrarySwitch, failCompanionLibrarySwitch, resetCompanionLibrarySwitchForTest } from './companionLibrarySwitch';
import { CompanionLibrarySwitchGate } from './CompanionLibrarySwitchGate';

/** Stands in for the shell: any render after the library closes throws, like a read of a closed owner. */
const library = (() => {
  let open = true;
  const listeners = new Set<() => void>();
  return {
    close: async () => { open = false; for (const listener of listeners) listener(); },
    reopen: () => { open = true; },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isOpen: () => open
  };
})();

function ShellReadingLibrary() {
  const open = useSyncExternalStore(library.subscribe, library.isOpen);
  if (!open) throw new Error('iOS companion database owner is not ready.');
  return <p>Library shell</p>;
}

function renderApp(gated: boolean, onReopen = vi.fn()) {
  const shell = <ShellReadingLibrary />;
  render(<StartupErrorBoundary moduleLabel="companion">
    {gated ? <CompanionLibrarySwitchGate onReopen={onReopen}>{shell}</CompanionLibrarySwitchGate> : shell}
  </StartupErrorBoundary>);
  return onReopen;
}

afterEach(() => { library.reopen(); resetCompanionLibrarySwitchForTest(); });

it('flashes the startup problem screen when the library closes under a mounted shell', async () => {
  renderApp(false);
  await act(() => library.close());
  expect(screen.getByRole('alert')).toHaveTextContent('Foliole startup encountered a problem');
});

it('shows the switching surface instead of a startup problem while the library is swapped', async () => {
  renderApp(true);
  expect(screen.getByText('Library shell')).toBeInTheDocument();
  await act(() => closeForCompanionLibrarySwitch(library.close));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Library shell')).not.toBeInTheDocument();
  expect(await screen.findByRole('status', { name: 'Switching library…' }, { timeout: 1500 })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('reports a failed swap on the root surface and reopens the app from there', async () => {
  const onReopen = renderApp(true);
  await act(() => closeForCompanionLibrarySwitch(library.close));
  act(() => { expect(failCompanionLibrarySwitch('The backup is no longer ready. Choose it again.')).toBe(true); });
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t switch library');
  expect(screen.getByRole('alert')).toHaveTextContent('The backup is no longer ready. Choose it again.');
  fireEvent.click(screen.getByRole('button', { name: 'Reopen Foliole' }));
  expect(onReopen).toHaveBeenCalledOnce();
});

it('leaves failures before any close to the sheet that started the swap', () => {
  renderApp(true);
  expect(failCompanionLibrarySwitch('Leave the sync group first.')).toBe(false);
  expect(screen.getByText('Library shell')).toBeInTheDocument();
});
