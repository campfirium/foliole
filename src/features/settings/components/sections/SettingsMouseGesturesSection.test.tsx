import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { PublicCommandProvider } from '../../../../shared/commands/publicCommandContext';
import { LocalizationProvider } from '../../../../shared/localization/LocalizationProvider';
import { AppConfirmationProvider } from '../../../../shared/ui';
import { MouseGestureSettingsProvider } from '../../context/MouseGestureSettingsProvider';

import {
  SettingsMouseGesturesHeaderControl,
  SettingsMouseGesturesSection
} from './SettingsMouseGesturesSection';

const COMMANDS = [
  {
    enabled: true,
    id: APP_COMMAND_IDS.goBack,
    keywords: ['back', 'history'],
    section: 'Navigation',
    title: 'Go Back'
  },
  {
    enabled: true,
    id: APP_COMMAND_IDS.scrollDocumentTop,
    keywords: ['scroll', 'top'],
    section: 'Navigation',
    title: 'Scroll to Document Top'
  },
  {
    enabled: true,
    id: APP_COMMAND_IDS.openWorkspaceSearch,
    keywords: ['find'],
    section: 'Workspace',
    title: 'Search'
  },
  {
    enabled: true,
    id: APP_COMMAND_IDS.openCommandPalette,
    keywords: ['palette'],
    section: 'Workspace',
    title: 'Command Palette'
  }
];

const GROUPED_GESTURE_LABELS = [
  'Up',
  'Up → Down',
  'Up → Left',
  'Up → Right',
  'Down',
  'Down → Up',
  'Down → Left',
  'Down → Right',
  'Left',
  'Left → Up',
  'Left → Down',
  'Left → Right',
  'Right',
  'Right → Up',
  'Right → Down',
  'Right → Left'
];

function renderSection() {
  return render(
    <LocalizationProvider>
      <AppConfirmationProvider>
        <PublicCommandProvider items={COMMANDS} runCommand={() => undefined}>
          <MouseGestureSettingsProvider>
            <SettingsMouseGesturesHeaderControl />
            <SettingsMouseGesturesSection />
          </MouseGestureSettingsProvider>
        </PublicCommandProvider>
      </AppConfirmationProvider>
    </LocalizationProvider>
  );
}

function openCommandPicker(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });
}

function openRecording(command: string) {
  fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: command } });
  fireEvent.click(screen.getByRole('button', { name: `Record gesture for ${command}` }));
  const surface = screen.getByText(
    'Right-drag here to draw a gesture with at least three direction changes.'
  ).parentElement as HTMLElement;
  expect(surface.closest('[role="dialog"]')).not.toBeNull();
  return surface;
}

function drawRecording(surface: HTMLElement, points: Array<[number, number]>) {
  act(() => {
    surface.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 2,
        buttons: 2,
        clientX: 100,
        clientY: 100
      })
    );
    for (const [clientX, clientY] of points) {
      window.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX, clientY })
      );
    }
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0 }));
  });
}

describe('SettingsMouseGesturesSection', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the enabled switch, collapsed display controls, grouped bindings, and inline command search states', () => {
    renderSection();
    expect(screen.getByRole('switch', { name: 'Mouse gestures' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Gesture appearance' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getAllByRole('img').map((item) => item.getAttribute('aria-label'))).toEqual(
      GROUPED_GESTURE_LABELS
    );

    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'top' } });
    expect(screen.getByRole('img', { name: 'Left → Up' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'Search' } });
    expect(screen.getByRole('button', { name: 'Record gesture for Search' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search commands'), {
      target: { value: 'nothing matches' }
    });
    expect(screen.getByText('No commands found.')).toBeInTheDocument();
  });

  it('changes a binding through a searchable projection of the public command catalog', () => {
    renderSection();
    openCommandPicker('Choose command for Up');
    fireEvent.change(screen.getByLabelText('Filter commands'), { target: { value: 'palette' } });
    const picker = screen.getByLabelText('Filter commands').parentElement
      ?.parentElement as HTMLElement;
    fireEvent.click(within(picker).getByRole('menuitem', { name: /Command Palette/ }));
    expect(screen.getByRole('button', { name: 'Choose command for Up' })).toHaveTextContent(
      'Command Palette'
    );
  });

  it('confirms before restoring only the default gesture bindings', async () => {
    renderSection();
    openCommandPicker('Choose command for Up');
    const picker = screen.getByLabelText('Filter commands').parentElement
      ?.parentElement as HTMLElement;
    fireEvent.click(within(picker).getByRole('menuitem', { name: /Command Palette/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore default bindings' }));
    const dialog = screen
      .getByText('Restore default gesture bindings?')
      .closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore default bindings' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Choose command for Up' })).toHaveTextContent(
        'Unbound'
      )
    );
  });

});

describe('mouse gesture command picker', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps one picker open and closes it with Escape', () => {
    renderSection();
    openCommandPicker('Choose command for Up');
    expect(screen.getAllByLabelText('Filter commands')).toHaveLength(1);

    openCommandPicker('Choose command for Down');
    expect(screen.getAllByLabelText('Filter commands')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Choose command for Down' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('Filter commands')).not.toBeInTheDocument();
  });
});

describe('custom mouse gesture recording', () => {
  beforeEach(() => window.localStorage.clear());

  it('records a three-segment gesture, rejects short and duplicate sequences, and cancels without saving', () => {
    renderSection();
    let surface = openRecording('Search');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    drawRecording(surface, [
      [60, 100],
      [100, 100],
      [100, 60]
    ]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.queryByText('Right-drag here to draw a gesture with at least three direction changes.')
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search commands'), {
      target: { value: 'Command Palette' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record gesture for Command Palette' }));
    surface = screen.getByText(
      'Right-drag here to draw a gesture with at least three direction changes.'
    ).parentElement as HTMLElement;
    drawRecording(surface, [[60, 100]]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Gesture is too short.')).toBeInTheDocument();
    drawRecording(surface, [
      [60, 100],
      [100, 100],
      [100, 60]
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Gesture already exists.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByRole('button', { name: 'Record gesture for Command Palette' })
    ).toBeInTheDocument();
  });
});
