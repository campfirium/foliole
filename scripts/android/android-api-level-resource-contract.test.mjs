// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('Android API-level resource contract', () => {
  it('limits the API 27 navigation bar attribute to v27 resources', () => {
    expect(read('android/app/src/main/res/values/styles.xml')).not.toContain('windowLightNavigationBar');
    expect(read('android/app/src/main/res/values-night/styles.xml')).not.toContain('windowLightNavigationBar');
    expect(read('android/app/src/main/res/values-v27/styles.xml')).toContain(
      '<item name="android:windowLightNavigationBar">true</item>'
    );
    expect(read('android/app/src/main/res/values-night-v27/styles.xml')).toContain(
      '<item name="android:windowLightNavigationBar">false</item>'
    );
  });
});
