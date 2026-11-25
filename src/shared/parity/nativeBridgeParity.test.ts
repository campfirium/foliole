// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { checkNativeBridge, parseAndroidPlugin, parseIosPlugin, scanNativeBridge, type SingleSidedMethods } from './nativeBridgeScan.testSupport';
import singleSided from './nativeBridgeSingleSided.json';

describe('native bridge parity', () => {
  it('implements every Capacitor plugin method on both Android and iOS', () => {
    const bridge = scanNativeBridge(process.cwd());
    expect(bridge.android.size, 'Android plugins must be discoverable').toBeGreaterThan(0);
    expect(bridge.ios.size, 'iOS plugins must be discoverable').toBeGreaterThan(0);
    for (const [plugin, methods] of [...bridge.android, ...bridge.ios]) {
      expect(methods.size, `${plugin} methods must be parsed`).toBeGreaterThan(0);
    }

    const result = checkNativeBridge(bridge, singleSided as SingleSidedMethods[]);
    expect(result, [
      '原生插件方法两端不对齐。补齐缺失一端；确实只在单端的，在',
      'src/shared/parity/nativeBridgeSingleSided.json 声明 plugin、platform、methods、reason。'
    ].join('\n')).toEqual({ undeclared: [], stale: [], missingReason: [] });
  });

  it('parses both plugin registration styles and reports a one-sided method', () => {
    const android = parseAndroidPlugin('@CapacitorPlugin(name = "Demo") class D {\n @PluginMethod\n public void open(PluginCall c) {}\n @PluginMethod(returnType = "none")\n public synchronized void save(PluginCall c) {} }');
    const literalList = parseIosPlugin('class D: CAPPlugin, CAPBridgedPlugin { let jsName = "Demo"\n let pluginMethods: [CAPPluginMethod] = ["open"].map { CAPPluginMethod(name: $0) } }');
    const explicitList = parseIosPlugin('class D: CAPPlugin, CAPBridgedPlugin { let jsName = "Demo"\n let pluginMethods: [CAPPluginMethod] = [ CAPPluginMethod(name: "open", returnType: R) ] }');
    expect(android).toEqual({ name: 'Demo', methods: ['open', 'save'] });
    expect(literalList).toEqual({ name: 'Demo', methods: ['open'] });
    expect(explicitList).toEqual(literalList);

    const result = checkNativeBridge({
      android: new Map([['Demo', new Set(android!.methods)]]),
      ios: new Map([['Demo', new Set(literalList!.methods)]])
    }, []);
    expect(result.undeclared).toEqual(['android:Demo.save']);
  });
});
