import { useCallback, useRef, useState } from 'react';

import { saveDesktopWebDavSetupDraft } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';

type FolderFields = { address: string; folder: string };

export function useWebDavSetupFields(groupId: string, onEdit: () => void, onSaveError: () => void) {
  const [fields, setFields] = useState<FolderFields>({ address: '', folder: '' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState<string>();
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const dirty = useRef(false);

  const hydrate = useCallback((next: FolderFields, user: string, savedPassword: boolean) => {
    setFields({ address: next.address, folder: next.folder });
    setUsername(user);
    setPassword(undefined);
    setHasSavedPassword(savedPassword);
    dirty.current = false;
  }, []);

  function persist() {
    return saveDesktopWebDavSetupDraft(groupId, { ...fields, username, ...(password === undefined ? {} : { password }) });
  }

  function saveDraft() {
    if (!dirty.current) return;
    dirty.current = false;
    void persist()?.catch(() => {
      dirty.current = true;
      onSaveError();
    });
  }

  function changeField(field: keyof FolderFields, value: string) {
    dirty.current = true;
    setFields(current => ({ ...current, [field]: value }));
    if (field === 'address') setHasSavedPassword(false);
    onEdit();
  }

  function changeUsername(value: string) {
    dirty.current = true;
    setUsername(value);
    setHasSavedPassword(false);
    onEdit();
  }

  function changePassword(value: string) {
    dirty.current = true;
    setPassword(value);
    setHasSavedPassword(false);
    onEdit();
  }

  return { fields, username, password: password ?? '', hasSavedPassword, hydrate, persist, saveDraft,
    changeField, changeUsername, changePassword };
}
