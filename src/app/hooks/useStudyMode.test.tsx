import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import { useStudyMode } from './useStudyMode';

beforeEach(() => {
  window.localStorage.clear();
});

function Probe() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const study = useStudyMode({ activeNodeId, isViewingTrashNode });
  return (
    <>
      <div data-testid="mode">{study.isStudyMode ? 'on' : 'off'}</div>
      <div data-testid="memory">{study.isDevReviewStatusBarPersistenceEnabled ? 'memory-on' : 'memory-off'}</div>
      <button onClick={() => study.startStudyMode()} type="button">
        guarded
      </button>
      <button
        onClick={() => {
          setActiveNodeId('due-node');
          study.startStudyMode({ force: true });
        }}
        type="button"
      >
        forced
      </button>
      <button onClick={() => setActiveNodeId(null)} type="button">
        delete current node
      </button>
      <button onClick={() => setIsViewingTrashNode(true)} type="button">
        open trash
      </button>
      <button onClick={() => study.toggleDevReviewStatusBarPersistence()} type="button">
        toggle dev memory
      </button>
    </>
  );
}

it('keeps guarded starts blocked without a current node but allows forced review starts', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'guarded' }).click());
  expect(screen.getByTestId('mode')).toHaveTextContent('off');

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  expect(screen.getByTestId('mode')).toHaveTextContent('on');
});

it('keeps an active review session when the current node is deleted', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  act(() => screen.getByRole('button', { name: 'delete current node' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('on');
});

it('keeps review mode paused when trash view opens', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  act(() => screen.getByRole('button', { name: 'open trash' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('on');
});

it('remembers the review status bar state only while dev memory is enabled', () => {
  const { unmount } = render(<Probe />);

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  act(() => screen.getByRole('button', { name: 'toggle dev memory' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('on');
  expect(screen.getByTestId('memory')).toHaveTextContent('memory-on');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarPersistenceEnabled)).toBe('true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarOpen)).toBe('true');

  unmount();
  const secondRender = render(<Probe />);

  expect(screen.getByTestId('mode')).toHaveTextContent('on');
  expect(screen.getByTestId('memory')).toHaveTextContent('memory-on');

  act(() => screen.getByRole('button', { name: 'toggle dev memory' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('on');
  expect(screen.getByTestId('memory')).toHaveTextContent('memory-off');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarPersistenceEnabled)).toBe('false');

  secondRender.unmount();
  render(<Probe />);

  expect(screen.getByTestId('mode')).toHaveTextContent('off');
  expect(screen.getByTestId('memory')).toHaveTextContent('memory-off');
});
