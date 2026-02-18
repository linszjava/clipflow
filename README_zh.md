# ClipFlow

ClipFlow 是一个基于 Tauri 和 Vue 3 构建的现代化、高性能 macOS 剪贴板管理工具。

[English](README.md) | [中文](README_zh.md)

## 功能特性

- **剪贴板监控**：自动保存复制的文本、图片和文件。
- **历史记录管理**：支持保存 7 天、30 天或永久历史记录。支持自定义自动删除时间。
- **置顶功能**：将重要的剪贴板内容置顶。
- **搜索与过滤**：按类型或内容快速查找剪贴板记录。
- **页面整理**：将剪贴板内容整理到不同的页面（分类）。
- **原生体验**：快速、轻量，与系统集成（托盘图标、全局快捷键）。
- **OCR 支持**：内置图片文字识别功能（仅限 macOS）。

## 技术栈

- **前端**：Vue 3, TypeScript, Tailwind CSS
- **后端**：Rust (Tauri), SQLite
- **存储**：本地文件系统（图片/文件） & SQLite（元数据）

## 开发指南

1. 安装依赖：
   ```bash
   npm install
   ```

2. 运行开发模式：
   ```bash
   npm run tauri dev
   ```

3. 构建发布版本：
   ```bash
   npm run tauri build
   ```

## 许可证

MIT
