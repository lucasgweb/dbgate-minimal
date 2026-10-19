import { derived, get } from 'svelte/store';
import { showModal } from '../modals/modalTools';
import { openedTabs, savedQueryDatabases } from '../stores';
import { changeTab, markTabSaved } from './common';
import SaveFileModal from '../modals/SaveFileModal.svelte';
import registerCommand from '../commands/registerCommand';
import { apiCall } from './api';
import getElectron from './getElectron';

// export function saveTabEnabledStore(editorStore) {
//   return derived(editorStore, editor => editor != null);
// }

export default async function saveTabFile(editor, saveMode, folder, format, fileExtension, defaultTeamFolder) {
  const tabs = get(openedTabs);
  const tabid = editor.activator.tabid;
  const data = editor.getData();
  const tabProps = tabs.find(x => x.tabid == tabid).props || {};
  const { savedFile, savedFilePath, savedFolder, savedCloudFolderId, savedCloudContentId, savedTeamFileId } = tabProps;

  // remember the database of a locally saved query, for the "Saved queries" list of that database
  const rememberQueryDatabase = (file, fileFolder) => {
    if (file && fileFolder == 'sql' && tabProps.conid && tabProps.database) {
      savedQueryDatabases.update(x => ({ ...x, [file]: { conid: tabProps.conid, database: tabProps.database } }));
    }
  };

  const handleSave = async () => {
    if (savedTeamFileId) {
      const resp = await apiCall('team-files/update', { teamFileId: savedTeamFileId, data });
      markTabSaved(tabid);
    } else if (savedCloudFolderId && savedCloudContentId) {
      const resp = await apiCall('cloud/save-file', {
        folid: savedCloudFolderId,
        fileName: savedFile,
        data,
        contentFolder: folder,
        format,
        cntid: savedCloudContentId,
      });
      if (resp.cntid) {
        markTabSaved(tabid);
      }
    } else {
      if (savedFile) {
        await apiCall('files/save', { folder: savedFolder || folder, file: savedFile, data, format });
        rememberQueryDatabase(savedFile, savedFolder || folder);
      }
      if (savedFilePath) {
        await apiCall('files/save-as', { filePath: savedFilePath, data, format });
      }
      markTabSaved(tabid);
    }
  };

  const onSave = (title, newProps) => {
    if (!newProps.savedCloudFolderId && !newProps.savedTeamFileId) {
      rememberQueryDatabase(newProps.savedFile, newProps.savedFolder);
    }
    changeTab(tabid, tab => ({
      ...tab,
      title,
      unsaved: false,
      props: {
        ...tab.props,
        savedFormat: format,
        ...newProps,
      },
    }));
  };

  if (saveMode == 'save-to-disk') {
    const electron = getElectron();
    const file = await electron.showSaveDialog({
      filters: [
        { name: `${fileExtension.toUpperCase()} files`, extensions: [fileExtension] },
        { name: `All files`, extensions: ['*'] },
      ],
      defaultPath: savedFilePath || `file.${fileExtension}`,
      properties: ['showOverwriteConfirmation'],
    });
    if (file) {
      await apiCall('files/save-as', { filePath: file, data, format });

      const path = window.require('path');
      const parsed = path.parse(file);

      onSave(parsed.name, {
        savedFile: null,
        savedFolder: null,
        savedFilePath: file,
        savedCloudFolderId: null,
        savedCloudContentId: null,
      });
    }
  } else if ((savedFile || savedFilePath) && saveMode == 'save') {
    handleSave();
  } else {
    showModal(SaveFileModal, {
      data,
      folder,
      format,
      fileExtension,
      name: savedFile || 'newFile',
      filePath: savedFilePath,
      onSave,
      folid: savedCloudFolderId,
      defaultTeamFolder,
      // cntid: savedCloudContentId,
    });
  }
}
