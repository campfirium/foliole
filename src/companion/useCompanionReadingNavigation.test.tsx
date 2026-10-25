import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionNextTopicFooter } from './CompanionNextTopicFooter';
import { CompanionReadingActivity } from './companionReadingActivity';
import { ReadingChrome } from './CompanionReadingChrome';
import { useCompanionReadingNavigation, type CompanionReadingNavigation } from './useCompanionReadingNavigation';

function Reader(props: { activity: CompanionReadingActivity; navigation?: CompanionReadingNavigation | undefined }) {
  const controls = useCompanionReadingNavigation(props.activity, props.navigation);
  return <>
    <ReadingChrome navigation={controls} onExit={() => {}} onOpenActions={() => {}} onOpenOutline={() => {}} title="Topic" />
    <div aria-label="End of topic">{controls?.next ? <CompanionNextTopicFooter disabled={controls.disabled} onOpen={controls.next} /> : null}</div>
    {controls?.error ? <p role="alert">Finish or retry the current change</p> : null}
  </>;
}
function setup() {
  const activity = new CompanionReadingActivity('A', () => {});
  const next = vi.fn();
  const navigation = { key: 'directory:A', previous: undefined, next };
  return { activity, navigation, next };
}

it('shares one in-flight activation across footer and chrome and uses the latest target after waiting', async () => {
  const { activity, navigation, next } = setup();
  let finish: (() => void) | undefined;
  activity.flushDraft = () => new Promise<void>(resolve => { finish = resolve; });
  const view = render(<Reader activity={activity} navigation={navigation} />);
  const footer = screen.getByLabelText('End of topic');
  fireEvent.click(footer.querySelector('button')!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Next topic' })[0]!);
  expect(screen.getByRole('button', { name: 'Previous topic' })).toBeDisabled();
  await waitFor(() => expect(finish).toBeDefined());
  const latest = vi.fn();
  view.rerender(<Reader activity={activity} navigation={{ ...navigation, next: latest }} />);
  await act(async () => finish?.());
  expect(latest).toHaveBeenCalledTimes(1);
  expect(next).not.toHaveBeenCalled();
});

it('keeps the current topic when a pending edit fails and allows retry', async () => {
  const { activity, navigation, next } = setup();
  activity.flushDraft = vi.fn().mockRejectedValueOnce(new Error('save failed'));
  render(<Reader activity={activity} navigation={navigation} />);
  fireEvent.click(screen.getByLabelText('End of topic').querySelector('button')!);
  await screen.findByRole('alert');
  expect(next).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('End of topic').querySelector('button')!);
  await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
});

it.each(['exit', 'other topic', 'other view', 'target removed'])(
  'does not open a late target after %s during a pending save', async change => {
    const { activity, navigation, next } = setup();
    let finish: (() => void) | undefined;
    activity.flushDraft = () => new Promise<void>(resolve => { finish = resolve; });
    const view = render(<Reader activity={activity} navigation={navigation} />);
    fireEvent.click(screen.getByLabelText('End of topic').querySelector('button')!);
    await waitFor(() => expect(finish).toBeDefined());
    if (change === 'exit') view.unmount();
    else view.rerender(<Reader activity={change === 'other topic' ? new CompanionReadingActivity('B', () => {}) : activity}
      navigation={change === 'other view' ? { ...navigation, key: 'browse' } : { ...navigation, next: undefined }} />);
    await act(async () => finish?.());
    expect(next).not.toHaveBeenCalled();
  }
);

it('disables both controls while editing and removes the footer at the end', () => {
  const { activity, navigation, next } = setup();
  activity.editing = true;
  const view = render(<Reader activity={activity} navigation={navigation} />);
  expect(screen.getAllByRole('button', { name: 'Next topic' }).every(button => button.hasAttribute('disabled'))).toBe(true);
  expect(next).not.toHaveBeenCalled();
  view.rerender(<Reader activity={activity} navigation={{ ...navigation, next: undefined, previous: vi.fn() }} />);
  expect(screen.getByLabelText('End of topic')).toBeEmptyDOMElement();
});


it('opens the previous topic through the same action and disables the last next direction', async () => {
  const { activity } = setup();
  const previous = vi.fn();
  render(<Reader activity={activity} navigation={{ key: 'directory:A', previous, next: undefined }} />);
  expect(screen.getByRole('button', { name: 'Next topic' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous topic' }));
  await waitFor(() => expect(previous).toHaveBeenCalledTimes(1));
});
