import type { RegisteredAppLocale as AppLocale } from '../localization/appLocaleRegistry.js';

export interface GuidedSampleTopicTemplate {
  attachmentIds: string[];
  content: string;
  id: string;
  parentId: string | null;
  title: string;
}

export interface GuidedSampleContentPack {
  locale: AppLocale;
  rootId: string;
  rootTitle: string;
  topics: GuidedSampleTopicTemplate[];
}
