import { invoke } from '@tauri-apps/api/core';

export const settingsApi = {
  getStoragePath(): Promise<string> {
    return invoke<string>('get_storage_path');
  },

  openStorageInFinder(): Promise<void> {
    return invoke<void>('open_storage_in_finder');
  },

  getDbPath(): Promise<string> {
    return invoke<string>('get_db_path');
  },

  openDbInFinder(): Promise<void> {
    return invoke<void>('open_db_in_finder');
  },

  isCustomStorage(): Promise<boolean> {
    return invoke<boolean>('is_custom_storage');
  },

  setStoragePath(path: string | null): Promise<void> {
    return invoke<void>('set_storage_path', { path });
  },
};
