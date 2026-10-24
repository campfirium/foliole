// @vitest-environment node
/* global process */

import { describe, expect, it } from 'vitest';

import {
  IOS_LIVE_BUNDLE_ID, IOS_LIVE_SIMULATOR_NAME, createIosLiveBuildArgs, findIosLiveSimulator, runIosSimulatorLive
} from './ios-simulator-live.mjs';

const template = { name: 'iPhone 17', isAvailable: true, state: 'Shutdown', deviceTypeIdentifier: 'type-17' };
const devices = (extra = []) => ({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [template, ...extra] } });

describe('iOS Simulator live reload', () => {
  it('reuses only the dedicated live reload Simulator', () => {
    expect(findIosLiveSimulator(devices())).toBeNull();
    expect(findIosLiveSimulator(devices([{ name: IOS_LIVE_SIMULATOR_NAME, isAvailable: true, udid: 'live' }])))
      .toMatchObject({ udid: 'live' });
  });

  it('builds the separate development bundle for that Simulator', () => {
    const args = createIosLiveBuildArgs({ derivedData: '/dd', repoRoot: '/repo', udid: 'live' });
    expect(args).toEqual(expect.arrayContaining([
      'platform=iOS Simulator,id=live', 'FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX=.dev', 'build'
    ]));
    expect(IOS_LIVE_BUNDLE_ID).toBe('com.campfirium.foliole.ios.dev');
  });

  it('creates the Simulator once, builds the live shell and returns the project to the bundled config', async () => {
    const calls = [];
    const repoRoot = process.cwd();
    await runIosSimulatorLive({
      capture: (_command, args) => args[1] === 'list' ? JSON.stringify(devices()) : 'new-udid',
      env: {},
      repoRoot,
      run: (command, args, options = {}) => calls.push([command, args[0], args[1], options.env?.FOLIOLE_DEV_LIVE_RELOAD ?? '-']),
      session: async ({ restore, start }) => { await start(); await restore(); }
    });

    expect(calls.map(([command, first, second, live]) => [command.split('/').at(-1), first, second, live])).toEqual([
      ['xcrun', 'simctl', 'bootstatus', '-'],
      ['open', '-a', 'Simulator', '-'],
      ['npm', 'run', 'android:web:build', '-'],
      ['cap', 'sync', 'ios', '1'],
      ['xcodebuild', '-project', `${repoRoot}/ios/App/App.xcodeproj`, '-'],
      ['xcrun', 'simctl', 'install', '-'],
      ['xcrun', 'simctl', 'launch', '-'],
      ['cap', 'sync', 'ios', '-']
    ]);
  });
});
