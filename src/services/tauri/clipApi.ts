import { invoke } from '@tauri-apps/api/core';

export interface DragStartPayload extends Record<string, unknown> {
  item: string[];
  matchCursor?: boolean;
  image?: {
    path: string;
  };
  onEvent?: unknown;
}

export const clipApi = {
  ocrImage(imagePath: string): Promise<string> {
    return invoke<string>('ocr_image', { imagePath });
  },

  startDrag(payload: DragStartPayload): Promise<void> {
    return invoke<void>('plugin:drag|start_drag', payload);
  },

  deleteFile(path: string): Promise<void> {
    return invoke<void>('delete_file', { path });
  },

  copyImageToClipboard(imagePath: string): Promise<void> {
    return invoke<void>('copy_image_to_clipboard', { imagePath });
  },
};
