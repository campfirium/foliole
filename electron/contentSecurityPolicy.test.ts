import { expect, it, vi } from 'vitest';

import {
  installMainWindowContentSecurityPolicy,
  withMainWindowContentSecurityPolicy
} from './contentSecurityPolicy.js';

it('injects a packaged main window content security policy', () => {
  const headers: Record<string, string[] | undefined> = withMainWindowContentSecurityPolicy('file:///app/index.html', {
    'X-Test': ['ok']
  });

  expect(headers['X-Test']).toEqual(['ok']);
  expect(headers['Content-Security-Policy']?.[0]).toContain("default-src 'self'");
  expect(headers['Content-Security-Policy']?.[0]).toContain("object-src 'none'");
  expect(headers['Content-Security-Policy']?.[0]).toContain('attachment:');
  expect(headers['Content-Security-Policy']?.[0]).not.toContain("'unsafe-eval'");
});

it('keeps vite dev server and websocket access only for localhost renderer URLs', () => {
  const headers = withMainWindowContentSecurityPolicy('http://127.0.0.1:24600');
  const policy = headers['Content-Security-Policy']?.[0] ?? '';

  expect(policy).toContain("'unsafe-eval'");
  expect(policy).toContain("'unsafe-inline'");
  expect(policy).toContain('http://127.0.0.1:*');
  expect(policy).toContain('ws://localhost:*');
});

it('installs the header hook once and only handles main frame responses', () => {
  type HeaderHandler = (
    details: {
      resourceType: string;
      responseHeaders?: Record<string, string[]>;
      url: string;
    },
    callback: (result: { responseHeaders?: Record<string, string[]> }) => void
  ) => void;
  const handlers: HeaderHandler[] = [];
  const session = {
    webRequest: {
      onHeadersReceived: vi.fn((handler: HeaderHandler) => handlers.push(handler))
    }
  };

  installMainWindowContentSecurityPolicy(session as never);
  installMainWindowContentSecurityPolicy(session as never);
  const subresourceCallback = vi.fn();
  const mainFrameCallback = vi.fn();
  handlers[0]?.(
    { resourceType: 'script', url: 'file:///app/main.js' },
    subresourceCallback
  );
  handlers[0]?.(
    { resourceType: 'mainFrame', responseHeaders: {}, url: 'file:///app/index.html' },
    mainFrameCallback
  );

  expect(session.webRequest.onHeadersReceived).toHaveBeenCalledTimes(1);
  expect(subresourceCallback).toHaveBeenCalledWith({});
  expect(mainFrameCallback.mock.calls[0]?.[0].responseHeaders?.['Content-Security-Policy']).toBeDefined();
});
