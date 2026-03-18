// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod monitor;
mod storage;
mod ocr;
mod clipboard_write;

mod file_manager;

use tauri_plugin_sql::{Migration, MigrationKind};

use tauri::{AppHandle, Manager};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS pages (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    rank INTEGER NOT NULL,
                    is_system BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS clips (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL, -- 'text', 'image', 'file'
                    content TEXT, -- text content or file path
                    page_id TEXT,
                    title TEXT,
                    is_pinned BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
                );
                
                INSERT OR IGNORE INTO pages (id, name, rank, is_system) VALUES ('inbox', 'Inbox', 0, 1);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_snippet_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS snippet_pages (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    rank INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS snippet_items (
                    id TEXT PRIMARY KEY,
                    page_id TEXT NOT NULL,
                    data TEXT NOT NULL, -- JSON formatted array of string
                    rank INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(page_id) REFERENCES snippet_pages(id) ON DELETE CASCADE
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_headers_to_snippet_pages",
            sql: "
                ALTER TABLE snippet_pages ADD COLUMN headers TEXT DEFAULT '[\"账号 (Account)\", \"密码 (Password)\", \"备注 (Notes)\"]';
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_password_to_snippet_pages",
            sql: "
                ALTER TABLE snippet_pages ADD COLUMN password TEXT;
            ",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .setup(|app| {
            monitor::init(app.handle());
            
            // Tray
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show QuickSnap", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
            
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app: &AppHandle, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 全局快捷键由前端 JS 动态注册管理
            #[cfg(desktop)]
            {
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new().build()
                )?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:quicksnap.db", migrations)
                .build()
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            storage::get_storage_path, 
            storage::is_custom_storage,
            storage::set_storage_path,
            storage::open_storage_in_finder,
            storage::get_db_path,
            storage::open_db_in_finder,
            ocr::ocr_image,
            clipboard_write::copy_image_to_clipboard,
            monitor::toggle_monitor,
            monitor::set_monitor_paused,
            monitor::is_monitor_paused,
            file_manager::delete_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
