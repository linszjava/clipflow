use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default)]
struct Config {
    custom_storage_path: Option<String>,
}

/// 获取配置文件路径
/// ~/Library/Application Support/clipflow-tauri/settings.json
fn get_config_path() -> PathBuf {
    let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("clipflow-tauri");
    dir.push("settings.json");
    dir
}

/// 从 settings.json 加载配置
fn load_config() -> Config {
    let path = get_config_path();
    if let Ok(content) = fs::read_to_string(path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Config::default()
    }
}

/// 保存配置到 settings.json
fn save_config(config: &Config) -> Result<(), String> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取剪贴板文件存储目录
pub fn get_storage_dir() -> PathBuf {
    let config = load_config();
    if let Some(path) = config.custom_storage_path {
        let p = PathBuf::from(path);
        if p.exists() {
            return p;
        }
    }
    
    // 默认路径: ~/Library/Application Support/clipflow-tauri/clips/
    let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("clipflow-tauri");
    dir.push("clips");
    dir
}

/// 确保存储目录存在
pub fn ensure_dir_exists() -> Result<PathBuf, String> {
    let dir = get_storage_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create storage dir: {}", e))?;
    Ok(dir)
}

/// Tauri command: 获取当前存储路径
#[tauri::command]
pub fn get_storage_path() -> String {
    get_storage_dir().to_string_lossy().to_string()
}

/// Tauri command: 检查是否使用了自定义路径
#[tauri::command]
pub fn is_custom_storage() -> bool {
    load_config().custom_storage_path.is_some()
}

/// Tauri command: 设置自定义存储路径
#[tauri::command]
pub fn set_storage_path(path: Option<String>) -> Result<(), String> {
    let mut config = load_config();
    
    if let Some(ref p) = path {
        // 检查新路径是否有效
        let new_path = Path::new(p);
        if !new_path.exists() {
            return Err("Selected path does not exist".to_string());
        }
        if !new_path.is_dir() {
            return Err("Selected path is not a directory".to_string());
        }
    }

    config.custom_storage_path = path.clone();
    save_config(&config)?;
    
    // 确保新目录存在（如果设置了）
    if path.is_some() {
        ensure_dir_exists()?;
    }
    
    Ok(())
}

/// Tauri command: 在 Finder 中打开存储目录
#[tauri::command]
pub fn open_storage_in_finder() -> Result<(), String> {
    let dir = get_storage_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    
    Ok(())
}
