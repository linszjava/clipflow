use std::fs;
use std::path::Path;
use crate::storage;

/// Delete a file if it is inside the application's storage directory.
/// This prevents accidental deletion of user files (e.g., in Downloads or Desktop).
#[tauri::command]
pub fn delete_file(path: String) -> Result<bool, String> {
    let file_path = Path::new(&path);
    
    // 1. Check if file exists
    if !file_path.exists() {
        return Ok(false); // File already gone, consider success
    }

    // 2. Security check: Ensure file is within app storage directory
    let storage_dir = storage::get_storage_dir();
    
    // Canonicalize paths to resolve symlinks and '..' components for safe comparison
    let canonical_file = match file_path.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            println!("[FileManager] Error canonicalizing file path '{}': {}", path, e);
            return Ok(false);
        }
    };
    
    let canonical_storage = match storage_dir.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            println!("[FileManager] Error canonicalizing storage path '{:?}': {}", storage_dir, e);
            storage_dir.clone()
        }
    };

    println!("[FileManager] Checking deletion:");
    println!("  > File: {:?}", canonical_file);
    println!("  > Storage: {:?}", canonical_storage);

    if !canonical_file.starts_with(&canonical_storage) {
        println!("[FileManager] Skipped deletion: File is outside storage directory");
        return Ok(false);
    }

    // 3. Delete the file
    match fs::remove_file(file_path) {
        Ok(_) => {
            println!("[FileManager] Deleted file: {}", path);
            Ok(true)
        }
        Err(e) => Err(format!("Failed to delete file: {}", e)),
    }
}
