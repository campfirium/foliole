import { tryAcquireAttachmentReceiveOwner } from './attachmentReceiveOwner.js';

const root = process.argv[2];
const disconnect = process.disconnect?.bind(process);
if (!root || !process.send || !disconnect) throw new Error('attachment_owner_fixture_arguments_missing');

const owner = tryAcquireAttachmentReceiveOwner(root);
process.send(owner.kind);
if (owner.kind === 'busy') disconnect();
else process.on('message', message => {
  if (message !== 'close') throw new Error('attachment_owner_fixture_command_invalid');
  owner.close();
  owner.close();
  disconnect();
});
