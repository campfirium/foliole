import { describe, expect, it, vi } from 'vitest';

import { subscribeMobileNodeLinks, type MobileLinkHost } from './mobileNodeLinkRuntime';

function host() {
  let listener!: (event: { url: string }) => void;
  let resolveLaunch!: (value: { url: string } | undefined) => void;
  const launch = new Promise<{ url: string } | undefined>((resolve) => { resolveLaunch = resolve; });
  const remove = vi.fn(async () => {});
  const app: MobileLinkHost = { addListener: vi.fn(async (_event, callback) => {
    listener = callback; return { remove };
  }), getLaunchUrl: vi.fn(() => launch) };
  return { app, emit: (url: string) => listener({ url }), resolveLaunch, remove };
}

describe('Capacitor mobile link delivery', () => {
  it('opens cold launch after listener registration', async () => {
    const h = host();
    const receive = vi.fn();
    const stop = subscribeMobileNodeLinks(receive, vi.fn(), h.app);
    h.resolveLaunch({ url: 'cold' });
    await vi.waitFor(() => expect(receive).toHaveBeenCalledExactlyOnceWith('cold'));
    stop();
  });
  it('prefers runtime events over a late launch lookup and keeps subsequent repeats', async () => {
    const h = host();
    const receive = vi.fn();
    const stop = subscribeMobileNodeLinks(receive, vi.fn(), h.app);
    h.emit('current');
    h.resolveLaunch({ url: 'old' });
    await Promise.resolve();
    await Promise.resolve();
    h.emit('current');
    expect(receive.mock.calls).toEqual([['current'], ['current']]);
    stop();
    h.emit('ignored');
    expect(receive).toHaveBeenCalledTimes(2);
    expect(h.remove).toHaveBeenCalledOnce();
  });
  it('cleans up when unmounted before listener registration resolves', async () => {
    const h = host();
    const stop = subscribeMobileNodeLinks(vi.fn(), vi.fn(), h.app);
    stop();
    await vi.waitFor(() => expect(h.remove).toHaveBeenCalledOnce());
    expect(h.app.getLaunchUrl).not.toHaveBeenCalled();
  });
  it('reports launch failure but leaves foreground delivery working', async () => {
    const h = host();
    vi.mocked(h.app.getLaunchUrl).mockRejectedValue(new Error('unavailable'));
    const receive = vi.fn();
    const report = vi.fn();
    const stop = subscribeMobileNodeLinks(receive, report, h.app);
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    h.emit('current');
    expect(receive).toHaveBeenCalledWith('current');
    stop();
  });
});
