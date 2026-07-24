import { DiscoursePublishDialogHost } from './DiscoursePublishDialogHost';
import { FoliolePublishDialogHost } from './FoliolePublishDialogHost';
import { FoliolePublishedDeleteDialogHost } from './FoliolePublishedDeleteDialogHost';
import { WordPressPublishDialogHost } from './WordPressPublishDialogHost';

export function WorkspacePublishDialogHosts() {
  return (
    <>
      <WordPressPublishDialogHost />
      <DiscoursePublishDialogHost />
      <FoliolePublishDialogHost />
      <FoliolePublishedDeleteDialogHost />
    </>
  );
}
