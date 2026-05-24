import { describe, expect, it } from 'vitest';

import { buildStartupReport, parseStartupTiming, resolveStartupBudgets } from './windows-startup-report.mjs';

function event(stage, offsetMs, payload = null) {
  return {
    payload,
    session: 'startup-session',
    stage,
    timestamp: new Date(Date.UTC(2026, 4, 25, 1, 0, 0, offsetMs)).toISOString()
  };
}

const budgets = {
  appReadyMs: 12000,
  appResponsiveMs: 13000,
  bridgeReadyMs: 10000,
  prewarmMs: 3000,
  resourceMs: 3000,
  windowVisibleMs: 3000
};

describe('parseStartupTiming', () => {
  it('parses Vite readiness and prewarm resource diagnostics from stdout', () => {
    const timing = parseStartupTiming([
      'VITE ready in 579 ms',
      '[electron-dev] startup timing prewarm_complete totalDurationMs=1614 ok=1 failed=0',
      '[electron-dev] startup timing prewarm_resource path=/src/main.tsx durationMs=244 ok=true status=200',
      '[electron-dev] startup timing electron_launch prewarmStatus=completed-before-launch prewarmElapsedMs=1614'
    ].join('\n'));

    expect(timing.viteReadyMs).toBe(579);
    expect(timing.prewarmTotalMs).toBe(1614);
    expect(timing.prewarmFinalStatus).toBe('complete');
    expect(timing.prewarmLaunchStatus).toBe('completed-before-launch');
    expect(timing.prewarmResources).toContainEqual(expect.objectContaining({
      durationMs: 244,
      ok: true,
      path: '/src/main.tsx',
      status: 200
    }));
  });

  it('parses timed-out prewarm diagnostics for budget failures', () => {
    const timing = parseStartupTiming([
      '[electron-dev] startup timing prewarm_timeout elapsedMs=3005 budgetMs=3000',
      '[electron-dev] startup timing prewarm_abort reason=budget-exceeded',
      '[electron-dev] startup timing electron_launch prewarmStatus=timeout-launch-electron prewarmElapsedMs=3005'
    ].join('\n'));

    expect(timing.prewarmTimeoutMs).toBe(3005);
    expect(timing.prewarmLaunchStatus).toBe('timeout-launch-electron');
  });
});

describe('buildStartupReport', () => {
  it('passes when startup stages and resources stay inside budgets', () => {
    const report = buildStartupReport({
      budgets,
      events: [
        event('main_process_start', 0),
        event('window_visible', 1400),
        event('main_window_ready', 1500),
        event('bridge_ready', 2600),
        event('app_ready', 3100),
        event('app_responsive', 3300),
        event('boot_context', 1520, {
          resources: [{ duration: 280, name: 'http://127.0.0.1:24600/src/main.tsx' }]
        })
      ],
      session: 'startup-session',
      stdout: '[electron-dev] startup timing prewarm_complete totalDurationMs=700 ok=1 failed=0'
    });

    expect(report.status).toBe('PASSED');
    expect(report.failures).toEqual([]);
    expect(report.timings.app_ready).toBe(3100);
  });

  it('fails with analysis clues when app readiness and renderer resources regress', () => {
    const report = buildStartupReport({
      budgets,
      events: [
        event('main_process_start', 0),
        event('window_visible', 1800),
        event('bridge_ready', 11000),
        event('app_ready', 14500),
        event('app_responsive', 15100),
        event('boot_context', 1900, {
          resources: [
            { duration: 7600, name: 'http://127.0.0.1:24600/src/app/styles.css' },
            { duration: 6200, name: 'http://127.0.0.1:24600/src/app/App.tsx' }
          ]
        })
      ],
      session: 'startup-session',
      stdout: '[electron-dev] startup timing prewarm_complete totalDurationMs=900 ok=1 failed=0'
    });

    expect(report.status).toBe('FAILED');
    expect(report.failures).toContain('bridge_ready=11000ms budget=10000ms');
    expect(report.failures).toContain('app_ready=14500ms budget=12000ms');
    expect(report.failures).toContain('resource=7600ms /src/app/styles.css');
  });

  it('uses environment overrides for startup budgets', () => {
    expect(resolveStartupBudgets({
      FOLIOLE_STARTUP_BUDGET_APP_READY_MS: '9000',
      FOLIOLE_STARTUP_BUDGET_PREWARM_MS: '1500'
    })).toEqual(expect.objectContaining({
      appReadyMs: 9000,
      prewarmMs: 1500
    }));
  });
});
