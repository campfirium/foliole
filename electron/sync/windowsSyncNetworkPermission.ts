import { spawn } from 'node:child_process';
import path from 'node:path';

import { app, dialog } from 'electron';

import { getMainWindow } from '../mainWindowRegistry.js';

type PermissionState = 'ready' | 'authorization_required' | 'authorization_cancelled'
  | 'authorization_failed' | 'private_network_required' | 'policy_restricted'
  | 'rule_conflict' | 'unavailable';

function permissionScriptPath() {
  return path.join(process.resourcesPath, 'sync-network-permission.ps1');
}

function runPermissionScript(action: 'Check' | 'Grant'): Promise<PermissionState> {
  return new Promise((resolve, reject) => {
    const script = permissionScriptPath();
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-Action', action, '-ExecutablePath', process.execPath
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', () => {
      try {
        const lines = output.trim().split(/\r?\n/u);
        const parsed = JSON.parse(lines.at(-1) ?? '') as { status?: PermissionState };
        if (parsed.status) resolve(parsed.status);
        else reject(new Error('sync_network_permission_unavailable'));
      } catch { reject(new Error('sync_network_permission_unavailable')); }
    });
  });
}

function permissionCopy() {
  const chinese = app.getLocale().toLowerCase().startsWith('zh');
  return chinese ? {
    title: '允许局域网同步',
    message: 'Foliole 需要在私人网络中发现其他设备并接收同步连接。',
    detail: '继续后 Windows 会请求管理员授权：仅允许系统 DNS Client 在私人本地子网使用 mDNS（UDP 5353），并允许当前 Foliole 在私人本地子网接收同步连接（TCP 38641）。不会放行公共网络。',
    buttons: ['允许并开启同步', '稍后']
  } : {
    title: 'Allow local Sync',
    message: 'Foliole needs to find devices and receive Sync connections on a private network.',
    detail: 'Windows will request administrator approval to allow DNS Client mDNS (UDP 5353) and this Foliole installation’s Sync connection (TCP 38641) from the local subnet on Private networks. Public networks stay blocked.',
    buttons: ['Allow and turn on Sync', 'Later']
  };
}

function permissionError(state: PermissionState) {
  const chinese = app.getLocale().toLowerCase().startsWith('zh');
  const messages = chinese ? {
    private_network_required: '当前网络不是私人网络。请在 Windows 网络设置中将可信网络设为私人网络，然后重试开启同步。',
    rule_conflict: '现有 Foliole 同步防火墙规则与所需范围冲突。请联系管理员检查规则后重试。',
    policy_restricted: 'Windows 管理策略未让同步网络规则生效。请联系管理员检查私人网络防火墙策略后重试。',
    authorization_failed: 'Windows 未完成同步网络授权。请使用管理员账户批准后重试。',
    unavailable: '无法核对 Windows 同步网络权限。请检查防火墙服务或联系管理员后重试。'
  } : {
    private_network_required: 'This network is not Private. Set a trusted network to Private in Windows network settings, then turn on Sync again.',
    rule_conflict: 'An existing Foliole Sync firewall rule conflicts with the required scope. Ask an administrator to review it, then retry.',
    policy_restricted: 'Windows policy did not apply the Sync network rules. Ask an administrator to review the Private network firewall policy, then retry.',
    authorization_failed: 'Windows did not complete Sync network authorization. Approve it with an administrator account, then retry.',
    unavailable: 'Foliole could not check Windows Sync network permissions. Check the firewall service or ask an administrator, then retry.'
  };
  return messages[state as keyof typeof messages] ?? messages.unavailable;
}

async function confirmGrant() {
  const copy = permissionCopy();
  const window = getMainWindow();
  const options = { type: 'question' as const, title: copy.title, message: copy.message,
    detail: copy.detail, buttons: copy.buttons, defaultId: 0, cancelId: 1, noLink: true };
  const choice = window
    ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  return choice.response === 0;
}

export async function ensureWindowsSyncNetworkPermission(
  dependencies: { check?: () => Promise<PermissionState>; confirm?: () => Promise<boolean>;
    grant?: () => Promise<PermissionState>; packaged?: boolean; platform?: NodeJS.Platform } = {}
) {
  if ((dependencies.platform ?? process.platform) !== 'win32'
      || !(dependencies.packaged ?? app.isPackaged)) return true;
  const check = dependencies.check ?? (() => runPermissionScript('Check'));
  const grant = dependencies.grant ?? (() => runPermissionScript('Grant'));
  const state = await check().catch(() => 'unavailable' as PermissionState);
  if (state === 'ready') return true;
  if (state === 'authorization_required') {
    if (!await (dependencies.confirm ?? confirmGrant)()) return false;
    const granted = await grant().catch(() => 'unavailable' as PermissionState);
    if (granted === 'ready') return true;
    if (granted === 'authorization_cancelled') return false;
    throw new Error(permissionError(granted));
  }
  throw new Error(permissionError(state));
}
