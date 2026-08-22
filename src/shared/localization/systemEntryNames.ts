import type { AppLocale } from './appLanguage';

export const SYSTEM_ENTRY_IDS = [
  'home', 'inbox', 'trash', 'virtual-root', 'published', 'shelved', 'removed'
] as const;

export type SystemEntryId = (typeof SYSTEM_ENTRY_IDS)[number];

const SYSTEM_ENTRY_NODE_IDS: Record<string, SystemEntryId> = {
  'special-home': 'home',
  'special-inbox': 'inbox',
  'special-trash': 'trash',
  'special-virtual-root': 'virtual-root',
  'special-virtual-published': 'published',
  'special-virtual-shelved': 'shelved',
  'special-virtual-removed': 'removed'
};

const SYSTEM_ENTRY_NAMES: Record<AppLocale, Record<SystemEntryId, string>> = {
  en: { home: 'Home', inbox: 'Inbox', trash: 'Trash', 'virtual-root': 'Virtual folders', published: 'Published', shelved: 'Shelved', removed: 'Removed' },
  de: { home: 'Start', inbox: 'Eingang', trash: 'Papierkorb', 'virtual-root': 'Virtuelle Ordner', published: 'Veröffentlicht', shelved: 'Zurückgestellt', removed: 'Entfernt' },
  es: { home: 'Inicio', inbox: 'Bandeja de entrada', trash: 'Papelera', 'virtual-root': 'Carpetas virtuales', published: 'Publicados', shelved: 'Aplazados', removed: 'Retirados' },
  fr: { home: 'Accueil', inbox: 'Boîte de réception', trash: 'Corbeille', 'virtual-root': 'Dossiers virtuels', published: 'Publiés', shelved: 'En attente', removed: 'Retirés' },
  it: { home: 'Inizio', inbox: 'Posta in arrivo', trash: 'Cestino', 'virtual-root': 'Cartelle virtuali', published: 'Pubblicati', shelved: 'Accantonati', removed: 'Rimossi' },
  ja: { home: 'ホーム', inbox: '受信トレイ', trash: 'ゴミ箱', 'virtual-root': '仮想フォルダ', published: '公開済み', shelved: '保留', removed: '削除済み' },
  ko: { home: '홈', inbox: '받은 편지함', trash: '휴지통', 'virtual-root': '가상 폴더', published: '게시됨', shelved: '보류됨', removed: '제거됨' },
  pl: { home: 'Start', inbox: 'Skrzynka odbiorcza', trash: 'Kosz', 'virtual-root': 'Foldery wirtualne', published: 'Opublikowane', shelved: 'Odłożone', removed: 'Usunięte' },
  'pt-BR': { home: 'Início', inbox: 'Caixa de entrada', trash: 'Lixeira', 'virtual-root': 'Pastas virtuais', published: 'Publicados', shelved: 'Em espera', removed: 'Removidos' },
  ru: { home: 'Главная', inbox: 'Входящие', trash: 'Корзина', 'virtual-root': 'Виртуальные папки', published: 'Опубликованные', shelved: 'Отложенные', removed: 'Удалённые' },
  'zh-Hans': { home: 'Home', inbox: '收件箱', trash: '回收站', 'virtual-root': '虚拟文件夹', published: '发布', shelved: '搁置', removed: '移除' },
  'zh-Hant': { home: 'Home', inbox: '收件匣', trash: '垃圾桶', 'virtual-root': '虛擬資料夾', published: '發佈', shelved: '擱置', removed: '移除' }
};

export function resolveSystemEntryId(nodeId: string): SystemEntryId | null {
  return SYSTEM_ENTRY_NODE_IDS[nodeId] ?? null;
}

export function defaultSystemEntryDisplayName(locale: AppLocale, id: SystemEntryId) {
  return SYSTEM_ENTRY_NAMES[locale]?.[id] ?? SYSTEM_ENTRY_NAMES.en[id];
}

export function resolveNodeDisplayTitle(locale: AppLocale, nodeId: string, storedTitle: string) {
  const id = resolveSystemEntryId(nodeId);
  return id ? defaultSystemEntryDisplayName(locale, id) : storedTitle;
}
