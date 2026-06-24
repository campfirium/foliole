import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import { useStudyMode } from './useStudyMode';

beforeEach(() => {
  window.localStorage.clear();
});

function Probe({
  initialCanStartStudyMode = false,
  onBlockedStart
}: {
  initialCanStartStudyMode?: boolean;
  onBlockedStart?: () => void;
}) {
  const [canStartStudyMode, setCanStartStudyMode] = useState(initialCanStartStudyMode);
  const study = useStudyMode({ canStartStudyMode, onBlockedStart });
  return (
    <>
      <div data-testid="mode">{study.isStudyMode ? 'on' : 'off'}</div>
      <div data-testid="memory">{study.isDevReviewStatusBarPersistenceEnabled ? 'memory-on' : 'memory-off'}</div>
      <button onClick={() => study.startStudyMode()} type="button">
        guarded
      </button>
      <button
        onClick={() => {
          setCanStartStudyMode(true);
          study.startStudyMode({ force: true });
        }}
        type="button"
      >
        forced
      </button>
      <button onClick={() => setCanStartStudyMode(false)} type="button">
        clear queue
      </button>
      <button onClick={() => setCanStartStudyMode(true)} type="button">
        fill queue
      </button>
      <button onClick={() => study.toggleDevReviewStatusBarPersistence()} type="button">
        toggle dev memory
      </button>
    </>
  );
}

it('keeps guarded starts blocked without a review queue but allows forced review starts', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'guarded' }).click());
  expect(screen.getByTestId('mode')).toHaveTextContent('off');

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  expect(screen.getByTestId('mode')).toHaveTextContent('on');
});

it('starts guarded mode when the review queue can start', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'fill queue' }).click());
  act(() => screen.getByRole('button', { name: 'guarded' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('on');
});

it('keeps an active review session when the queue later becomes empty', () => {
  render(<Probe />);

  act(() => screen.getByRole('button', { name: 'forced' }).click());
  act(() => screen.getByRole('button', { name: 'clear queue' }).click());

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
  const secondRender = render(<Probe initialCanStartStudyMode />);

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

it('does not restore stale dev review status when no review queue can start', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarPersistenceEnabled, 'true');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.devReviewStatusBarOpen, 'true');

  render(<Probe />);

  expect(screen.getByTestId('mode')).toHaveTextContent('off');
  expect(screen.getByTestId('memory')).toHaveTextContent('memory-on');
});

it('reports blocked guarded starts without opening review mode', () => {
  const onBlockedStart = vi.fn();
  render(<Probe onBlockedStart={onBlockedStart} />);

  act(() => screen.getByRole('button', { name: 'guarded' }).click());

  expect(screen.getByTestId('mode')).toHaveTextContent('off');
  expect(onBlockedStart).toHaveBeenCalledTimes(1);
});
