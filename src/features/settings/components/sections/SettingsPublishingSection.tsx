import { DiscoursePublishingSettings } from './DiscoursePublishingSettings';
import { FoliolePublishingSettings } from './FoliolePublishingSettings';
import { WordPressPublishingSettings } from './WordPressPublishingSettings';

export function SettingsPublishingSection() {
  return (
    <>
      <FoliolePublishingSettings />
      <WordPressPublishingSettings />
      <DiscoursePublishingSettings />
    </>
  );
}
