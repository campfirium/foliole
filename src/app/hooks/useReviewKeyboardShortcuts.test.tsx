import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { onWindowEscape } from '../../shared/platform/keyboard';

import { ReviewShortcutHarness } from './useReviewKeyboardShortcuts.testUtils';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = '';
});

it('ignores review action shortcuts while the current review item is not visible', () => {
  const readReviewTopic = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      readReviewTopic={readReviewTopic}
      isCurrentReviewItemVisible={false}
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

  expect(readReviewTopic).not.toHaveBeenCalled();
});

it('resumes the hidden review item with Space', () => {
  const resumeReviewItem = vi.fn();
  render(
    <ReviewShortcutHarness
      isCurrentItemGradable
      isCurrentReviewItemVisible={false}
      readingReadShortcuts={{ primary: { key: ' ' } }}
      revealAnswerShortcuts={{ primary: { key: 'x' } }}
      resumeReviewItem={resumeReviewItem}
    />
  );

  const button = document.createElement('button');
  button.textContent = 'Flow item';
  document.body.append(button);
  button.focus();
  fireEvent.keyDown(button, { code: 'Space', key: ' ' });

  expect(resumeReviewItem).toHaveBeenCalledTimes(1);
});

it('leaves review editing when Escape starts from an editable target', () => {
  const readReviewTopic = vi.fn(async () => true);
  render(<ReviewShortcutHarness readReviewTopic={readReviewTopic} />);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.append(editable);
  editable.focus();
  fireEvent.focusIn(editable);

  fireEvent.keyDown(editable, { key: 'Escape' });
  fireEvent.keyDown(window, { key: 'r' });

  expect(document.activeElement).not.toBe(editable);
  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});

it('lets an open Escape surface close before leaving review editing', () => {
  const readReviewTopic = vi.fn(async () => true);
  const closeSurface = vi.fn();
  render(<ReviewShortcutHarness readReviewTopic={readReviewTopic} />);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.append(editable);
  editable.focus();
  fireEvent.focusIn(editable);
  const unlistenSurface = onWindowEscape(closeSurface);

  fireEvent.keyDown(editable, { key: 'Escape' });
  expect(document.activeElement).toBe(editable);
  fireEvent.keyDown(window, { key: 'r' });
  expect(readReviewTopic).not.toHaveBeenCalled();
  unlistenSurface();
  fireEvent.keyDown(editable, { key: 'Escape' });
  fireEvent.keyDown(window, { key: 'r' });

  expect(closeSurface).toHaveBeenCalledTimes(1);
  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});

it('runs review shortcuts after focus moves from the editor to a panel button', () => {
  const readReviewTopic = vi.fn(async () => true);
  const closeSurface = vi.fn();
  render(<ReviewShortcutHarness readReviewTopic={readReviewTopic} />);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  const panelButton = document.createElement('button');
  panelButton.textContent = 'Flow item';
  document.body.append(editable, panelButton);
  editable.focus();
  fireEvent.focusIn(editable);
  panelButton.focus();
  fireEvent.focusIn(panelButton);
  const unlistenSurface = onWindowEscape(closeSurface);

  fireEvent.keyDown(window, { key: 'r' });
  fireEvent.keyDown(panelButton, { key: 'Escape' });
  fireEvent.keyDown(window, { key: 'r' });
  unlistenSurface();

  expect(readReviewTopic).toHaveBeenCalledTimes(2);
  expect(closeSurface).toHaveBeenCalledTimes(1);
});

it('keeps review editing available after a transient dialog closes', () => {
  const readReviewTopic = vi.fn(async () => true);
  const closeDialog = vi.fn();
  render(<ReviewShortcutHarness readReviewTopic={readReviewTopic} />);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  const dialog = document.createElement('section');
  dialog.setAttribute('role', 'dialog');
  const slider = document.createElement('input');
  slider.type = 'range';
  dialog.append(slider);
  document.body.append(editable, dialog);
  editable.focus();
  fireEvent.focusIn(editable);
  slider.focus();
  fireEvent.focusIn(slider);
  const unlistenDialog = onWindowEscape(closeDialog);

  fireEvent.keyDown(slider, { key: 'Escape' });
  unlistenDialog();
  dialog.remove();
  fireEvent.keyDown(window, { key: 'r' });
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.keyDown(window, { key: 'r' });

  expect(closeDialog).toHaveBeenCalledTimes(1);
  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});

it('deletes the hidden current review item with Delete', () => {
  const deleteCurrentReviewItem = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      deleteCurrentReviewItem={deleteCurrentReviewItem}
      isCurrentReviewItemVisible={false}
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

  expect(deleteCurrentReviewItem).toHaveBeenCalledTimes(1);
});

it('runs review action shortcuts when the current review item is visible', () => {
  const readReviewTopic = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      readReviewTopic={readReviewTopic}
      isCurrentReviewItemVisible
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

  expect(readReviewTopic).toHaveBeenCalledTimes(1);
});

it('runs the visible reading soon shortcut before later/read choices', () => {
  const revisitReviewTopicSoon = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      isCurrentReviewItemVisible
      revisitReviewTopicSoon={revisitReviewTopicSoon}
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));

  expect(revisitReviewTopicSoon).toHaveBeenCalledTimes(1);
});

it('reveals a visible review card with F while Space and Enter stay free', () => {
  const revealReviewAnswer = vi.fn();
  render(
    <ReviewShortcutHarness
      isCurrentItemGradable
      isCurrentReviewItemVisible
      revealReviewAnswer={revealReviewAnswer}
    />
  );

  fireEvent.keyDown(window, { code: 'Space', key: ' ' });
  fireEvent.keyDown(window, { key: 'Enter' });
  expect(revealReviewAnswer).not.toHaveBeenCalled();

  fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });

  expect(revealReviewAnswer).toHaveBeenCalledTimes(1);
});

it('deletes the visible review item with Delete', () => {
  const deleteCurrentReviewItem = vi.fn(() => true);
  render(
    <ReviewShortcutHarness
      deleteCurrentReviewItem={deleteCurrentReviewItem}
      isCurrentReviewItemVisible
    />
  );

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

  expect(deleteCurrentReviewItem).toHaveBeenCalledTimes(1);
});

it('grades the revealed review card as Good with Space', () => {
  const gradeReviewCard = vi.fn(async () => true);
  render(
    <ReviewShortcutHarness
      gradeGoodShortcuts={{ primary: { key: '3' }, secondary: { key: ' ' } }}
      gradeReviewCard={gradeReviewCard}
      isAnswerRevealed
      isCurrentItemGradable
    />
  );

  fireEvent.keyDown(window, { code: 'Space', key: ' ' });

  expect(gradeReviewCard).toHaveBeenCalledWith(3);
});
