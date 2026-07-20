import { DiscoursePublishDialogHost } from './DiscoursePublishDialogHost';
import { FoliolePublishDialogHost } from './FoliolePublishDialogHost';
import { WordPressPublishDialogHost } from './WordPressPublishDialogHost';

export function WorkspacePublishDialogHosts() {
  return (
    <>
      <WordPressPublishDialogHost />
      <DiscoursePublishDialogHost />
      <FoliolePublishDialogHost />
    </>
  );
}
