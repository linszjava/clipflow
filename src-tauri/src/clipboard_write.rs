use arboard::Clipboard;
use image::GenericImageView;

/// 将图片文件写入系统剪贴板（作为图片而非路径）
#[tauri::command]
pub async fn copy_image_to_clipboard(image_path: String) -> Result<(), String> {
    let img = image::open(&image_path)
        .map_err(|e| format!("无法读取图片: {}", e))?;
    
    let (width, height) = img.dimensions();
    let rgba = img.to_rgba8();
    let bytes = rgba.into_raw();
    
    let img_data = arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(bytes),
    };
    
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("无法访问剪贴板: {}", e))?;
    
    clipboard.set_image(img_data)
        .map_err(|e| format!("写入剪贴板失败: {}", e))?;
    
    println!("[Clipboard] Image copied: {}", image_path);
    Ok(())
}
