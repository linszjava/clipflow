use tauri::{AppHandle, Manager, Emitter};
use std::thread;
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};
use arboard::Clipboard;
use arboard::ImageData;
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use clipboard_rs::{Clipboard as RsClipboard, ClipboardContext};

use crate::storage;

/// 全局监控暂停标志
static MONITOR_PAUSED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn toggle_monitor() -> bool {
    let was_paused = MONITOR_PAUSED.load(Ordering::Relaxed);
    MONITOR_PAUSED.store(!was_paused, Ordering::Relaxed);
    let now_active = was_paused; // 之前暂停 → 现在活跃
    println!("[Monitor] Auto-capture toggled: {}", if now_active { "ON" } else { "OFF" });
    now_active
}

#[tauri::command]
pub fn set_monitor_paused(paused: bool) {
    MONITOR_PAUSED.store(paused, Ordering::Relaxed);
    println!("[Monitor] Auto-capture set to: {}", if paused { "OFF" } else { "ON" });
}

#[tauri::command]
pub fn is_monitor_paused() -> bool {
    MONITOR_PAUSED.load(Ordering::Relaxed)
}

#[derive(Clone, serde::Serialize)]
struct ClipboardPayload {
    content_type: String, // "text", "image", "file"
    content: String,      // 文本内容 或 文件路径
}

pub fn init(app: &AppHandle) {
    let app_handle = app.clone();
    
    thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[Monitor] Failed to create clipboard: {}", e);
                return;
            }
        };
        let mut last_text = clipboard.get_text().unwrap_or_default();
        let mut last_image_hash: u64 = 0;
        let mut last_emitted_content = String::new();
        let mut last_emitted_image_hash: u64 = 0; // 上次发送的图片 hash（用于跨路径去重）
        let mut skip_image_until = std::time::Instant::now(); // 文件路径已检测为图片时，跳过位图检测
        let mut last_files: Vec<String> = Vec::new(); // Track file list to avoid duplicates
        
        // 初始化图片hash（避免启动时触发）
        if let Ok(img) = clipboard.get_image() {
            last_image_hash = simple_hash(&img.bytes);
            last_emitted_image_hash = last_image_hash;
        }
        
        let thread_id = uuid::Uuid::new_v4().to_string().chars().take(8).collect::<String>();
        println!("[Monitor-{}] Clipboard monitoring started", thread_id);
        
        loop {
            thread::sleep(Duration::from_millis(500));
            
            // 暂停状态下跳过检测
            if MONITOR_PAUSED.load(Ordering::SeqCst) {
                // println!("[Monitor-{}] Monitoring paused, skipping...", thread_id);
                continue;
            }
            
            
            // 0. 优先检查文件列表 (Fix: Prioritize files over text)
            if let Ok(files) = ClipboardContext::new().and_then(|ctx| ctx.get_files()) {
                let files_str: Vec<String> = files;

                if !files_str.is_empty() {
                     if files_str != last_files {
                         last_files = files_str.clone();
                         println!("[Monitor-{}] Files detected: {:?}", thread_id, files_str);
                         
                         // Update last_text to avoid re-triggering text logic in next loop if it matches
                         if let Ok(txt) = clipboard.get_text() {
                             last_text = txt;
                         }

                         for path_str in files_str {
                             let path_buf = PathBuf::from(&path_str);
                             let has_image_ext = path_buf.extension()
                                 .and_then(|e| e.to_str())
                                 .map(|s| s.to_lowercase())
                                 .map(|ext| ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"].contains(&ext.as_str()))
                                 .unwrap_or(false);
                             
                             let type_ = if has_image_ext { "image" } else { "file" };
                             
                             let result = app_handle.emit("clipboard-changed", ClipboardPayload {
                                 content_type: type_.to_string(),
                                 content: path_str.clone(),
                             });
                              if let Err(e) = result {
                                 eprintln!("[Monitor-{}] Failed to emit file event: {}", thread_id, e);
                             }
                         }
                    }
                    // Skip text/image checks if files are present
                    continue;
                } else {
                    last_files.clear();
                }
            }

            // 1. 优先检查文本变化（最常用）
            let current_text = clipboard.get_text().unwrap_or_default();
            if current_text != last_text && !current_text.is_empty() {
                last_text = current_text.clone();
                
                let preview: String = current_text.chars().take(50).collect();
                println!("[Monitor-{}] Text changed: {}", thread_id, preview);

                let clean_text = current_text.trim();
                let decoded_cow = percent_encoding::percent_decode_str(clean_text).decode_utf8_lossy();
                let decoded_text = decoded_cow.to_string();
                
                let path_str = if decoded_text.starts_with("file://") {
                    decoded_text.trim_start_matches("file://").to_string()
                } else {
                    decoded_text.clone()
                };

                let path_buf = std::path::PathBuf::from(&path_str);
                let exists = path_buf.exists();
                let is_file = path_buf.is_file();
                
                println!("[Monitor-{}] Checking path: '{}'", thread_id, path_str);
                println!("[Monitor-{}] Exists: {}, IsFile: {}", thread_id, exists, is_file);
                
                let has_image_ext = path_buf.extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase())
                    .map(|ext| ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"].contains(&ext.as_str()))
                    .unwrap_or(false);

                let (final_type, final_content) = if exists && is_file {
                    if has_image_ext {
                        println!("[Monitor-{}] Recognized as IMAGE (Strict)", thread_id);
                        ("image".to_string(), path_str)
                    } else {
                        println!("[Monitor-{}] Recognized as FILE (Strict)", thread_id);
                        ("file".to_string(), path_str)
                    }
                } else if has_image_ext && (path_str.starts_with('/') || path_str.starts_with("\\")) {
                     println!("[Monitor-{}] Recognized as IMAGE (Lenient)", thread_id);
                     ("image".to_string(), path_str)
                } else {
                    println!("[Monitor-{}] Fallback to TEXT", thread_id);
                    ("text".to_string(), current_text.clone())
                };
                
                // 内容完全相同则跳过
                if final_content == last_emitted_content {
                    println!("[Monitor-{}] Skipping duplicate content", thread_id);
                    if let Ok(img) = clipboard.get_image() {
                        last_image_hash = simple_hash(&img.bytes);
                        last_emitted_image_hash = last_image_hash;
                    }
                    continue;
                }
                
                // 如果是图片文件路径，标记跳过接下来的位图检测（5秒）
                // 因为剪贴板同时有文件路径和图片预览数据，避免重复
                let is_image_file = final_type == "image";
                if is_image_file {
                    skip_image_until = std::time::Instant::now() + Duration::from_secs(5);
                    // 立即同步图片 hash
                    if let Ok(img) = clipboard.get_image() {
                        let h = simple_hash(&img.bytes);
                        last_image_hash = h;
                        last_emitted_image_hash = h;
                    }
                }
                
                last_emitted_content = final_content.clone();
                
                let result = app_handle.emit("clipboard-changed", ClipboardPayload {
                    content_type: final_type,
                    content: final_content,
                });
                
                if let Err(e) = result {
                    eprintln!("[Monitor-{}] Failed to emit event: {}", thread_id, e);
                }
                
                // 非图片文件也同步 hash
                if !is_image_file {
                    if let Ok(img) = clipboard.get_image() {
                        last_image_hash = simple_hash(&img.bytes);
                    }
                }
                continue;
            }
            
            // 2. 检查图片变化（位图数据）
            // 如果刚刚通过文件路径检测到了图片，跳过位图检测
            if std::time::Instant::now() < skip_image_until {
                if let Ok(img) = clipboard.get_image() {
                    last_image_hash = simple_hash(&img.bytes);
                }
                continue;
            }
            
            if let Ok(img) = clipboard.get_image() {
                let hash = simple_hash(&img.bytes);
                if hash != last_image_hash && hash != last_emitted_image_hash 
                   && !img.bytes.is_empty() && img.width > 1 && img.height > 1 {
                    last_image_hash = hash;
                    last_text = clipboard.get_text().unwrap_or_default();
                    
                    match save_image_to_disk(&img) {
                        Ok(path) => {
                            last_emitted_content = path.clone();
                            last_emitted_image_hash = hash;
                            
                            println!("[Monitor-{}] Image saved: {}", thread_id, path);
                            let result = app_handle.emit("clipboard-changed", ClipboardPayload {
                                content_type: "image".to_string(),
                                content: path,
                            });
                            if let Err(e) = result {
                                eprintln!("[Monitor-{}] Failed to emit image event: {}", thread_id, e);
                            }
                        }
                        Err(e) => {
                            eprintln!("[Monitor-{}] Failed to save image: {}", thread_id, e);
                        }
                    }
                } else if hash != last_image_hash {
                    last_image_hash = hash;
                }
            }
        }
    });
}

/// 简单哈希函数，用于比较图片是否变化
fn simple_hash(data: &[u8]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    // 只对前 8KB 做哈希以提高性能
    let len = data.len().min(8192);
    data[..len].hash(&mut hasher);
    data.len().hash(&mut hasher);
    hasher.finish()
}

/// 将剪贴板图片保存为 PNG 文件
fn save_image_to_disk(img: &arboard::ImageData) -> Result<String, String> {
    let dir = storage::ensure_dir_exists()?;
    let filename = format!("{}.png", uuid::Uuid::new_v4());
    let filepath = dir.join(&filename);
    
    let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> = 
        image::ImageBuffer::from_raw(
            img.width as u32,
            img.height as u32,
            img.bytes.to_vec(),
        ).ok_or_else(|| "Failed to create image buffer".to_string())?;
    
    img_buf.save(&filepath).map_err(|e| format!("Failed to save image: {}", e))?;
    
    Ok(filepath.to_string_lossy().to_string())
}
