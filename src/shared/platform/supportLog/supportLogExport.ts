import { Capacitor, registerPlugin } from '@capacitor/core';

import { serializeSupportLog } from './supportLog';

const fileHandoff = registerPlugin<{
  shareSupportLog(options: { text: string }): Promise<{ status: string }>;
}>('FolioleArticleHandoff');

export async function exportSupportLog(mobile: boolean) {
  const platform = mobile ? Capacitor.getPlatform() : 'desktop';
  if (platform !== 'desktop' && platform !== 'android' && platform !== 'ios') return false;
  const text = serializeSupportLog(platform);
  if (!text) return false;
  if (mobile) {
    const result = await fileHandoff.shareSupportLog({ text });
    return result.status === 'presented' || result.status === 'cancelled';
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'foliole-log.txt';
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}
