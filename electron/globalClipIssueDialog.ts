import { app, dialog, shell, type MessageBoxOptions } from 'electron';

export type GlobalClipIssueStatus = 'copyFailed' | 'empty' | 'importFailed' | 'permissionRequired';

const MACOS_ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

export function resolveGlobalClipCopyIssue(permission: 'denied' | 'granted' | 'unavailable') {
  if (permission === 'granted') return null;
  return permission === 'denied' ? 'permissionRequired' as const : 'copyFailed' as const;
}

export async function reportGlobalClipCopyIssue(
  permission: 'denied' | 'granted' | 'unavailable',
  log: (event: string) => void,
  presentIssue: (status: GlobalClipIssueStatus) => Promise<boolean>
) {
  const issue = resolveGlobalClipCopyIssue(permission);
  if (!issue) return false;
  log(issue === 'permissionRequired' ? 'global_clip_permission_required' : 'global_clip_copy_adapter_unavailable');
  await presentIssue(issue);
  return true;
}

function resolveZhHansIssueText(status: GlobalClipIssueStatus) {
  switch (status) {
    case 'copyFailed':
      return { detail: '源应用没有接受复制。', message: '未能开始剪辑' };
    case 'empty':
      return { detail: '请先选择文本或复制图片。', message: '没有剪辑内容' };
    case 'importFailed':
      return { detail: '请稍后再试。', message: '未能完成剪辑' };
    case 'permissionRequired':
      return {
        detail: 'Foliole 需要辅助功能权限才能复制其他应用中的选区。',
        message: '允许 Foliole 进行全局剪辑'
      };
  }
}

function resolveEnglishIssueText(status: GlobalClipIssueStatus) {
  switch (status) {
    case 'copyFailed':
      return { detail: 'The source app did not accept copy.', message: 'Could not start clipping' };
    case 'empty':
      return { detail: 'Select text or copy an image first.', message: 'Nothing clipped' };
    case 'importFailed':
      return { detail: 'Try again in a moment.', message: 'Could not finish clipping' };
    case 'permissionRequired':
      return {
        detail: 'Foliole needs Accessibility access to copy selections from other apps.',
        message: 'Allow Foliole to clip from any app'
      };
  }
}

export function resolveGlobalClipIssueText(status: GlobalClipIssueStatus, locale = 'en') {
  return locale.toLowerCase().startsWith('zh')
    ? resolveZhHansIssueText(status)
    : resolveEnglishIssueText(status);
}

export function resolveGlobalClipIssueDialogOptions(
  status: GlobalClipIssueStatus,
  locale = 'en'
): MessageBoxOptions {
  const isZhHans = locale.toLowerCase().startsWith('zh');
  const text = resolveGlobalClipIssueText(status, locale);
  const permissionRequired = status === 'permissionRequired';
  return {
    buttons: permissionRequired
      ? isZhHans ? ['取消', '打开系统设置'] : ['Cancel', 'Open System Settings']
      : [isZhHans ? '知道了' : 'OK'],
    cancelId: 0,
    defaultId: permissionRequired ? 1 : 0,
    detail: text.detail,
    message: text.message,
    noLink: true,
    type: permissionRequired ? 'warning' : 'info'
  };
}

export async function presentGlobalClipIssue(
  status: GlobalClipIssueStatus,
  platform: NodeJS.Platform = process.platform
) {
  try {
    const result = await dialog.showMessageBox(resolveGlobalClipIssueDialogOptions(status, app.getLocale()));
    if (status === 'permissionRequired' && platform === 'darwin' && result.response === 1) {
      await shell.openExternal(MACOS_ACCESSIBILITY_SETTINGS_URL);
    }
    return true;
  } catch (error) {
    console.error('[global-clip] issue dialog failed', status, error);
    return false;
  }
}
