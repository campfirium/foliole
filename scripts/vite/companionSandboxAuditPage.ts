type AuditPage = { name: string; matches: RegExp };
const settingsDetails: Record<string, AuditPage> = {
  appearance: { name: '外观', matches: /^外观/u },
  tabs: { name: '标签栏', matches: /^外观/u },
  reminders: { name: '提醒', matches: /^提醒/u },
  clozeGuard: { name: '挖空保护', matches: /^学习/u },
  learning: { name: '学习', matches: /^学习/u },
  foregroundTime: { name: '前台时长', matches: /^复习统计/u },
  reviewStatistics: { name: '复习统计', matches: /^复习统计/u },
  device: { name: '设备', matches: /^设备/u },
  diagnostics: { name: '诊断', matches: /^设备/u },
  syncActivity: { name: '同步活动', matches: /^设备/u },
  syncConnection: { name: '同步连接', matches: /^设备/u },
  storage: { name: '存储', matches: /^备份/u },
  backup: { name: '备份', matches: /^备份/u },
  attachments: { name: '附件', matches: /^备份/u },
  logs: { name: '日志', matches: /^关于/u },
  about: { name: '关于', matches: /^关于/u },
  debug: { name: '调试', matches: /^关于/u }
};

function resolveDirectoryAuditPage(kind: string | undefined): AuditPage {
  switch (kind) {
    case 'trash':
    case 'trashFolder':
      return { name: '回收站', matches: /^目录 \/ (Trash|多选)|^子目录 \/ 顶栏/u };
    case 'virtual':
      return { name: '专题与索引', matches: /^目录 \/ (Dive|普通虚拟)|^子目录/u };
    case 'externalFolder':
    case 'externalDirectory':
      return { name: '外部目录', matches: /^目录 \/ 外部|^子目录/u };
    case 'internal':
      return { name: '文件夹', matches: /^目录和子目录|^子目录|^目录 \/ 多选|^文件夹/u };
    default:
      return { name: '目录', matches: /^目录(?:根页| \/|和子目录)/u };
  }
}

/** Reads the destination already published for preview restore by the real app. */
export function resolveSandboxAuditPage(document: Document): AuditPage | null {
  const destination = document.querySelector('[data-companion-preview-destination]')?.getAttribute('data-companion-preview-destination');
  if (!destination) return null;
  const [action, settings, , selection, directoryOpen, , pdf] = JSON.parse(destination) as
    [string, string, string | null, { kind?: string } | undefined, boolean, string | null, string | null];
  if (action === 'review') return { name: 'Flow', matches: /^Flow|^全局 \/ 捕获/u };
  if (document.querySelector('[data-companion-reading-page="true"]')) {
    return { name: pdf || document.querySelector('.pdf-document-surface') ? 'PDF 阅读' : '主题阅读', matches: /^主题|^PDF|^回收站主题/u };
  }
  if (action === 'search') return { name: '搜索', matches: /^搜索/u };
  if (action === 'more') {
    if (settings === 'sync' || settings === 'syncGroup') return { name: '同步', matches: /^同步|^设备/u };
    return settingsDetails[settings] ?? { name: '设置', matches: /^设置首页|^底部导航/u };
  }
  if (directoryOpen) return resolveDirectoryAuditPage(selection?.kind);
  return { name: '浏览', matches: /^(?:浏览|子目录和浏览|全局 \/ 捕获)/u };
}
