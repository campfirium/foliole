import { DiscoursePublishDialogHost } from './DiscoursePublishDialogHost';
import { WordPressPublishDialogHost } from './WordPressPublishDialogHost';

export function WorkspacePublishDialogHosts() {
  return (
    <>
      <WordPressPublishDialogHost />
      <DiscoursePublishDialogHost />
    </>
  );
}
