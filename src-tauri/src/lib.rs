use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Manager, State, Emitter};
use notify_debouncer_full::{new_debouncer, notify::{RecursiveMode, Watcher}, DebounceEventResult};

// State to hold the current watched file path
struct WatchedFile(Arc<Mutex<Option<PathBuf>>>);

// Command to open file dialog and return the selected file path
#[tauri::command]
async fn open_file_dialog(app: tauri::AppHandle) -> std::result::Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app.dialog()
        .file()
        .add_filter("GDS Files", &["gds", "gdsii", "dxf"])
        .blocking_pick_file();

    Ok(file_path.map(|p| p.as_path().unwrap().to_string_lossy().to_string()))
}

// Command to start watching a file for changes
#[tauri::command]
async fn watch_file(
    path: String,
    app: tauri::AppHandle,
    watched_file: State<'_, WatchedFile>,
) -> std::result::Result<(), String> {
    let path_buf = PathBuf::from(&path);

    // Update the watched file state
    {
        let mut watched = watched_file.0.lock().unwrap();
        *watched = Some(path_buf.clone());
    }

    // Create a debounced file watcher (500ms debounce)
    let app_handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| {
            match result {
                Ok(events) => {
                    for event in events {
                        if event.kind.is_modify() {
                            // Emit event to frontend
                            let _ = app_handle.emit("file-changed", ());
                        }
                    }
                }
                Err(errors) => {
                    for error in errors {
                        log::error!("File watch error: {:?}", error);
                    }
                }
            }
        },
    ).map_err(|e| format!("Failed to create file watcher: {}", e))?;

    // Watch the file
    debouncer
        .watcher()
        .watch(&path_buf, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch file: {}", e))?;

    // Store the debouncer in app state to keep it alive
    // Note: In a production app, you'd want to manage this more carefully
    // For now, we'll just let it run until the app closes
    std::mem::forget(debouncer);

    Ok(())
}

// Command to stop watching the current file
#[tauri::command]
async fn unwatch_file(watched_file: State<'_, WatchedFile>) -> std::result::Result<(), String> {
    let mut watched = watched_file.0.lock().unwrap();
    *watched = None;
    Ok(())
}

// Command to get the last opened file path from app data
#[tauri::command]
async fn get_last_file_path(app: tauri::AppHandle) -> std::result::Result<Option<String>, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let last_file_path = app_dir.join("last_file.txt");

    if last_file_path.exists() {
        std::fs::read_to_string(&last_file_path)
            .map(|s| Some(s.trim().to_string()))
            .map_err(|e| format!("Failed to read last file path: {}", e))
    } else {
        Ok(None)
    }
}

// Command to save the last opened file path to app data
#[tauri::command]
async fn save_last_file_path(path: String, app: tauri::AppHandle) -> std::result::Result<(), String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Create app data directory if it doesn't exist
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let last_file_path = app_dir.join("last_file.txt");

    std::fs::write(&last_file_path, path)
        .map_err(|e| format!("Failed to save last file path: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .manage(WatchedFile(Arc::new(Mutex::new(None))))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      open_file_dialog,
      watch_file,
      unwatch_file,
      get_last_file_path,
      save_last_file_path,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
