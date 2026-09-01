import type { AppLocale } from '../../../shared/localization/appLanguage';

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
