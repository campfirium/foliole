import '../../test/nodeBacklinks.testSupport';

import { fireEvent, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { mutate, panel, persisted, reader, save, writer } from '../../test/nodeBacklinks.testSupport';

it('updates two independent mounted panels after saved links, renames, deletion and restoration', async () => {
  const a = panel(writer), b = panel(reader);
  const views = [a, b];
  for (const view of views) await within(view.container).findByText('No topics link back to this topic yet.');
  await save('source', 'Source', 'First [[Target]] and [[Target]].');
  expect(persisted('source')?.content).toBe('First [[Target]] and [[Target]].');
  for (const view of views) {
    const button = await within(view.container).findByRole('button', { name: /Source.*First.*2/s });
    fireEvent.click(button); expect(view.select).toHaveBeenLastCalledWith('source');
    expect(view.container).toHaveTextContent('Found 1 topics');
  }
  await save('source', 'Renamed source', 'Updated [[Target]].');
  expect(persisted('source')?.title).toBe('Renamed source');
  for (const view of views) await within(view.container).findByRole('button', { name: /Renamed source.*Updated/s });
  await save('source', 'Renamed source', 'Removed link.');
  for (const view of views) await waitFor(() => expect(within(view.container).queryByRole('button')).toBeNull());
  await save('source', 'Renamed source', 'Added again [[Target]].');
  for (const view of views) await within(view.container).findByRole('button', { name: /Added again/ });
  await mutate('soft_delete_nodes', { nodeIds: ['source'], deletedAt: new Date().toISOString() });
  expect(persisted('source')?.deleted_at).not.toBeNull();
  for (const view of views) await waitFor(() => expect(within(view.container).queryByRole('button')).toBeNull());
  await mutate('restore_nodes', { nodeIds: ['source'] });
  expect(persisted('source')?.deleted_at).toBeNull();
  for (const view of views) await within(view.container).findByRole('button', { name: /Added again/ });
  await save('target', 'New target', 'Target body.', reader);
  expect(persisted('target')?.title).toBe('New target');
  for (const view of views) await waitFor(() => expect(within(view.container).queryByRole('button')).toBeNull());
  await save('source', 'Renamed source', 'Matches new [[New target]].');
  for (const view of views) await within(view.container).findByRole('button', { name: /Matches new/ });
  a.unmount(); b.unmount();
});
