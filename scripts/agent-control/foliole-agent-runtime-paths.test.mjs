import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveAgentControlDescriptorPath,
  resolveFolioleRuntimeAppName,
  resolveFolioleUserDataPaths
} from './foliole-agent-runtime-paths.mjs';

describe('Foliole Agent Control runtime paths', () => {
  it('keeps Electron identity and public CLI on the same production path', () => {
    expect(resolveFolioleRuntimeAppName('Foliole', {})).toBe('foliole');
    expect(resolveFolioleUserDataPaths({ appDataRoot: 'C:\\Users\\me\\AppData\\Roaming', env: {} })).toEqual({
      defaultUserDataPath: path.join('C:\\Users\\me\\AppData\\Roaming', 'foliole'),
      userDataPath: path.join('C:\\Users\\me\\AppData\\Roaming', 'foliole')
    });
    expect(resolveAgentControlDescriptorPath({
      env: { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' },
      homeDir: 'C:\\Users\\me',
      platform: 'win32'
    })).toBe(path.join('C:\\Users\\me\\AppData\\Roaming', 'foliole', 'cache', 'agent-control-session.json'));
  });

  it('honors controlled descriptor, user-data, and internal overrides without preview scanning', () => {
    expect(resolveAgentControlDescriptorPath({ env: { FOLIOLE_AGENT_DESCRIPTOR: ' D:\\session.json ' } }))
      .toBe(path.resolve('D:\\session.json'));
    expect(resolveAgentControlDescriptorPath({ env: { FOLIOLE_USER_DATA_PATH: 'D:\\user-data' } }))
      .toBe(path.join(path.resolve('D:\\user-data'), 'cache', 'agent-control-session.json'));
    expect(resolveAgentControlDescriptorPath({
      env: { APPDATA: 'C:\\AppData', FOLIOLE_BUILD_CHANNEL: 'internal', FOLIOLE_PREVIEW_SANDBOX_ROOT: 'D:\\preview' },
      homeDir: 'C:\\Users\\me',
      platform: 'win32'
    })).toBe(path.join('C:\\AppData', 'foliole-internal', 'cache', 'agent-control-session.json'));
  });
});
