use std::process::Command;
use tauri::{AppHandle, Manager};

/// Tauri command: 对图片进行 OCR 文字识别
/// 使用 macOS 原生 Vision 框架，支持中英文
#[tauri::command]
pub async fn ocr_image(app: AppHandle, image_path: String) -> Result<String, String> {
    // 获取 Swift 脚本路径（从 resources 目录）
    let resource_path = app.path()
        .resolve("scripts/ocr.swift", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Cannot find OCR script: {}", e))?;
    
    println!("[OCR] Script: {:?}, Image: {}", resource_path, image_path);
    
    let output = Command::new("swift")
        .arg(&resource_path)
        .arg(&image_path)
        .output()
        .map_err(|e| format!("Failed to execute OCR: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR failed: {}", stderr));
    }
    
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    if text.is_empty() {
        return Err("未识别到任何文字".to_string());
    }
    
    println!("[OCR] Recognized {} chars", text.len());
    Ok(text)
}
