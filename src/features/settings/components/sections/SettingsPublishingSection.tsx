import { DiscoursePublishingSettings } from './DiscoursePublishingSettings';
import { WordPressPublishingSettings } from './WordPressPublishingSettings';

export function SettingsPublishingSection() {
  return (
    <>
      <WordPressPublishingSettings />
      <DiscoursePublishingSettings />
    </>
  );
}
