import { BodyOverflowDialogHost } from './BodyOverflowDialogHost';
import { DiscoursePublishDialogHost } from './DiscoursePublishDialogHost';
import { FoliolePublishDialogHost } from './FoliolePublishDialogHost';
import { FoliolePublishedDeleteDialogHost } from './FoliolePublishedDeleteDialogHost';
import { SplitTopicDialogHost } from './SplitTopicDialogHost';
import { WordPressPublishDialogHost } from './WordPressPublishDialogHost';

export function WorkspacePublishDialogHosts() {
  return (
    <>
      <BodyOverflowDialogHost />
      <WordPressPublishDialogHost />
      <DiscoursePublishDialogHost />
      <SplitTopicDialogHost />
      <FoliolePublishDialogHost />
      <FoliolePublishedDeleteDialogHost />
    </>
  );
}
