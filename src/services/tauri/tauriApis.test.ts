import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('tauri service apis', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('clipApi 调用参数应正确', async () => {
    const { clipApi } = await import('./clipApi');
    await clipApi.deleteFile('/tmp/test.png');
    await clipApi.copyImageToClipboard('/tmp/test.png');
    await clipApi.ocrImage('/tmp/test.png');
    await clipApi.startDrag({ item: ['/tmp/test.png'], matchCursor: false });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'delete_file', { path: '/tmp/test.png' });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'copy_image_to_clipboard', { imagePath: '/tmp/test.png' });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'ocr_image', { imagePath: '/tmp/test.png' });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'plugin:drag|start_drag', {
      item: ['/tmp/test.png'],
      matchCursor: false,
    });
  });

  it('settingsApi 调用参数应正确', async () => {
    const { settingsApi } = await import('./settingsApi');
    await settingsApi.getStoragePath();
    await settingsApi.openStorageInFinder();
    await settingsApi.getDbPath();
    await settingsApi.openDbInFinder();
    await settingsApi.isCustomStorage();
    await settingsApi.setStoragePath('/tmp/storage');
    await settingsApi.setStoragePath(null);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_storage_path');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'open_storage_in_finder');
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'get_db_path');
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'open_db_in_finder');
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'is_custom_storage');
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'set_storage_path', { path: '/tmp/storage' });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'set_storage_path', { path: null });
  });

  it('shortcutApi 调用参数应正确', async () => {
    const { shortcutApi } = await import('./shortcutApi');
    await shortcutApi.toggleMonitor();
    await shortcutApi.isMonitorPaused();

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'toggle_monitor');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'is_monitor_paused');
  });
});
