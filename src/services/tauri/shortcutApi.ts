import { invoke } from '@tauri-apps/api/core';

export const shortcutApi = {
  toggleMonitor(): Promise<boolean> {
    return invoke<boolean>('toggle_monitor');
  },

  isMonitorPaused(): Promise<boolean> {
    return invoke<boolean>('is_monitor_paused');
  },
};
