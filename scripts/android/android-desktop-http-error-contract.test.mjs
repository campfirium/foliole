// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

it('preserves binary HTTP failure while exposing only fixed desktop auth reasons', () => {
  const source = fs.readFileSync(
    'android/app/src/main/java/com/foliole/android/FolioleCompanionDesktopHttpClient.java',
    'utf8'
  );

  expect(source.match(/throw binaryResourceError\(status, errorCode\);/gu)).toHaveLength(2);
  expect(source).toContain('new JSONObject(readBody(connection, status)).optString("error", "")');
  expect(source).toContain('"unknown_device".equals(value)');
  expect(source).toContain('"invalid_signature".equals(value)');
  expect(source).not.toContain('throw new IllegalStateException(readBody(connection, status))');
});
