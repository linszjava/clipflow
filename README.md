# ClipFlow

A modern, high-performance clipboard manager for macOS, built with Tauri and Vue 3.

[English](README.md) | [中文](README_zh.md)

## Features

- **Clipboard Monitoring**: Automatically saves text, images, and files from clipboard.
- **History Management**: Keep history for 7/30 days, or forever. Supports custom auto-delete time.
- **Pinning**: Pin important clips to the top.
- **Search & Filter**: Quickly find clips by type or content.
- **Page Organization**: Organize clips into pages.
- **Native Experience**: Fast, lightweight, and system-integrated (Tray icon, global shortcuts).
- **OCR Support**: Built-in text recognition for images (macOS only).

## Usage

### Main Interface
Manage your clips efficiently with pages.

![Main Interface](https://p.ipic.vip/s9ngus.jpg)

### OCR Feature
Extract text from images instantly.

![OCR Feature](https://p.ipic.vip/6xujb4.png)

## Tech Stack

- **Frontend**: Vue 3, TypeScript, Tailwind CSS
- **Backend**: Rust (Tauri), SQLite
- **Storage**: Local file system (Images/Files) & SQLite (Metadata)

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run tauri dev
   ```

3. Build for release:
   ```bash
   npm run tauri build
   ```

## License

MIT
