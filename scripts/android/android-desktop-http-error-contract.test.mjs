// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

it('preserves binary HTTP failure while exposing only fixed desktop auth reasons', () => {
  const source = fs.readFileSync(
    'android/app/src/main/java/com/foliole/android/FolioleCompanionDesktopHttpClient.java',
    'utf8'
  );

  expect(source).toContain('throw binaryResourceError(status, errorCode, method, prepared.path);');
  expect(source).toContain('"/companion/sync-pack".equals(route)');
  expect(source).toContain('"Desktop binary resource " + method + " " + safeResourcePath(path)');
  expect(source).toContain('new JSONObject(readBody(connection, status)).optString("error", "")');
  expect(source).toContain('"unknown_authorization".equals(value)');
  expect(source).toContain('"invalid_signature".equals(value)');
  expect(source).not.toContain('throw new IllegalStateException(readBody(connection, status))');
});
