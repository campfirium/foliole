import { describe, expect, it } from 'vitest';

import { assertAgentCompletionMessage } from './codex-task-completion.mjs';

describe('codex task completion guard', () => {
  it('rejects final reports that hand preview failures back to the user', () => {
    const message = 'R：Windows 预览没完成，被现有 importDerivedHighlights.ts 类型错误挡在 Electron 编译阶段。';

    expect(() => assertAgentCompletionMessage(message)).toThrow('agent reported preview failure');
  });

  it('rejects restart-failed preview reports that avoid the simple failed wording', () => {
    const message = 'R：Windows mirror 已同步新代码，但 Windows 预览 full restart 失败，日志已有 app_ready/bridge_ready，所以本轮不能写 pushed。';

    expect(() => assertAgentCompletionMessage(message)).toThrow('agent reported preview failure');
  });

  it('rejects reports that stop a preview waiting process', () => {
    const message = 'R：Windows 预览这次没有完成，windows:preview:native 一直停在 preview-dedupe waiting 队列里，我已停止该挂起进程；代码验证和 Electron 编译已通过。';

    expect(() => assertAgentCompletionMessage(message)).toThrow('agent reported preview failure');
  });

  it('rejects startup health reports that say preview never went green', () => {
    const message = 'R：Windows 预览重启阶段失败，原因是 app-ready-timeout，诊断显示 renderer_load_complete 且无 renderer error，所以本轮代码验证通过但预览启动健康检查没收绿。';

    expect(() => assertAgentCompletionMessage(message)).toThrow('agent reported preview failure');
  });

  it('rejects fallback-start shell-exited preview startup failures', () => {
    const message = 'R：Windows 预览启动失败，阶段是 fallback-start / shell-exited；lint:desktop 还被一个既有的 TruncatedTextTooltip.tsx 行数问题挡住。';

    expect(() => assertAgentCompletionMessage(message)).toThrow('agent reported preview failure');
  });

  it('rejects final reports that skip a required Windows preview', () => {
    const message = 'R：未跑 Windows 预览，因为当前桌面 lint/typecheck 以及一个既有 heading 渲染断言仍有非本轮红灯。';

    expect(() => assertAgentCompletionMessage(message)).toThrow('agent reported preview failure');
  });

  it('rejects synced-only Windows preview reports that still claim pushed', () => {
    const message = ['V：测试、lint、文件预算通过，Windows 预览已同步；但自动截图服务现在连不上。', 'pushed'].join('\n');

    expect(() => assertAgentCompletionMessage(message)).toThrow('agent reported preview failure');
  });

  it('allows ordinary completion reports', () => {
    const message = ['C：已完成。', 'V：客户端可以打开并查看。', 'R：无已知阻塞', 'pushed'].join('\n');

    expect(() => assertAgentCompletionMessage(message)).not.toThrow();
  });
});
