import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  PdfTopBarsDocument,
  PdfTopBarsDocumentConnection
} from '../../features/pdf/components/PdfTopBarsDocument';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger
} from '../../shared/ui';

import { PdfTopBarsToggle } from './PdfTopBarsToggle';
import { PdfTopBar, WorkspacePdfTopBars } from './WorkspacePdfTopBars';

const backend = vi.hoisted(() => ({
  fingerprint: 'one',
  settings: {} as Record<string, string>,
  failSave: false,
  nativeControls: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('react-pdf', () => ({
  useDocumentContext: () => ({ pdf: { fingerprints: [backend.fingerprint] } })
}));
vi.mock('../../shared/platform/appSettingsState', () => ({
  loadRuntimeAppSettingsState: async () => backend.settings,
  saveRuntimeAppSettingsState: async (next: Record<string, string>) => {
    if (backend.failSave) return false;
    backend.settings = { ...backend.settings, ...next };
    return true;
  }
}));
vi.mock('../../shared/platform/windowControls', () => ({
  setMainWindowNativeControlsVisible: backend.nativeControls
}));

function Reader(props: { pdf: boolean; immersive?: boolean }) {
  return (
    <WorkspacePdfTopBars isImmersiveMode={props.immersive ?? false}>
      <PdfTopBar kind="window">
        <button>Window control</button>
      </PdfTopBar>
      <PdfTopBar kind="document">
        <input aria-label="Navigation control" />
        <AppDropdownMenu>
          <AppDropdownMenuTrigger asChild>
            <button>Navigation menu</button>
          </AppDropdownMenuTrigger>
          <AppDropdownMenuContent>
            <AppDropdownMenuItem>Keep reading</AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </PdfTopBar>
      {props.pdf ? (
        <PdfTopBarsDocument key={backend.fingerprint} isVisible>
          <PdfTopBarsDocumentConnection />
          <PdfTopBarsToggle onInteraction={() => undefined} />
        </PdfTopBarsDocument>
      ) : null}
      <button>Reading area</button>
    </WorkspacePdfTopBars>
  );
}
async function settle() {
  await act(async () => {});
}
function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}
function bars() {
  return ['window', 'document'].map((kind) => screen.getByTestId(`pdf-${kind}-top-bar`));
}
function expectVisible(visible: boolean) {
  bars().forEach((bar) => expect(bar).toHaveAttribute('data-visible', String(visible)));
}

beforeEach(() => {
  backend.fingerprint = 'one';
  backend.settings = {};
  backend.failSave = false;
  backend.nativeControls.mockClear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('shows on entry, reveals immediately, waits after leaving, and restores non-PDF chrome', async () => {
  const mounted = renderWithLocalization(<Reader pdf />);
  await settle();
  bars().forEach((bar) => expect(bar).toHaveAttribute('data-floating', 'true'));
  expectVisible(true);
  advance(3000);
  expectVisible(false);
  expect(backend.nativeControls).toHaveBeenLastCalledWith(false);
  const reveal = screen.getByTestId('pdf-top-bars-reveal-zone');
  fireEvent.mouseEnter(reveal);
  expectVisible(true);
  fireEvent.mouseLeave(reveal);
  advance(299);
  expectVisible(true);
  advance(1);
  expectVisible(false);
  mounted.rerender(<Reader pdf={false} />);
  await settle();
  bars().forEach((bar) => expect(bar).toHaveAttribute('data-floating', 'false'));
  expectVisible(true);
  expect(backend.nativeControls).toHaveBeenLastCalledWith(true);
});

it('protects focused controls after the pointer leaves and resumes hiding after blur', async () => {
  renderWithLocalization(<Reader pdf />);
  await settle();
  const navigation = screen.getByLabelText('Navigation control');
  fireEvent.mouseEnter(bars()[1]!);
  fireEvent.focus(navigation);
  fireEvent.mouseLeave(bars()[1]!);
  advance(5000);
  expectVisible(true);
  fireEvent.blur(navigation);
  advance(300);
  expectVisible(false);
});

it('protects a portaled menu without hover or focus, then releases it on close', async () => {
  renderWithLocalization(<Reader pdf />);
  await settle();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Navigation menu' }), { key: 'ArrowDown' });
  await settle();
  advance(0);
  const menu = screen.getByRole('menu');
  fireEvent.blur(menu);
  advance(5000);
  expectVisible(true);
  fireEvent.keyDown(menu, { key: 'Escape' });
  await settle();
  advance(0);
  fireEvent.blur(screen.getByRole('button', { name: 'Navigation menu' }));
  advance(300);
  expectVisible(false);
});

it('remembers the toggle only for the selected PDF and retains it after reopening', async () => {
  const mounted = renderWithLocalization(<Reader pdf />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Auto-hide top bars' }));
  await settle();
  bars().forEach((bar) => expect(bar).toHaveAttribute('data-floating', 'false'));
  expect(
    JSON.parse(backend.settings[APP_SETTINGS_STORAGE_KEYS.pdfTopBarsPreferences] ?? '{}')
  ).toEqual({ one: false });
  backend.fingerprint = 'two';
  mounted.rerender(<Reader pdf />);
  await settle();
  expect(screen.getByRole('button', { name: 'Auto-hide top bars' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  backend.fingerprint = 'one';
  mounted.rerender(<Reader pdf />);
  await settle();
  expect(screen.getByRole('button', { name: 'Auto-hide top bars' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});

it('keeps the previous selection on failed saves and honors immersive chrome', async () => {
  const mounted = renderWithLocalization(<Reader pdf />);
  await settle();
  backend.failSave = true;
  fireEvent.click(screen.getByRole('button', { name: 'Auto-hide top bars' }));
  await settle();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Auto-hide top bars' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  mounted.rerender(<Reader pdf immersive />);
  await settle();
  expect(screen.queryByTestId('pdf-top-bars-reveal-zone')).not.toBeInTheDocument();
  expect(backend.nativeControls).toHaveBeenLastCalledWith(false);
});
