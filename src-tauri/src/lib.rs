use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

/// State for managing the Python backend process
struct PythonBackend(Mutex<Option<Child>>);

/// Determine the config file path.
/// Priority:
/// 1. SOLARIA_CONFIG environment variable
/// 2. ~/.config/solaria/config.toml (if exists)
/// 3. ./config.toml (development fallback)
pub fn get_config_path() -> PathBuf {
    // 1. Check environment variable
    if let Ok(path) = std::env::var("SOLARIA_CONFIG") {
        return PathBuf::from(path);
    }

    // 2. Check ~/.config/solaria/config.toml
    if let Some(config_dir) = dirs::config_dir() {
        let config_path = config_dir.join("solaria").join("config.toml");
        if config_path.exists() {
            return config_path;
        }
    }

    // 3. Fallback to local config.toml (dev mode)
    PathBuf::from("config.toml")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Set up logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Spawn Python backend
            let config_path = get_config_path();
            log::info!("Starting kbunified with config: {:?}", config_path);

            // Get the resource directory (where the app was launched from)
            // In dev mode, this is the project root
            let working_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

            let child_result = Command::new("uv")
                .args(["run", "python", "run.py"])
                .arg(&config_path)
                .current_dir(&working_dir)
                .spawn();

            match child_result {
                Ok(child) => {
                    log::info!("Python backend started with PID: {}", child.id());
                    app.manage(PythonBackend(Mutex::new(Some(child))));
                }
                Err(e) => {
                    log::error!("Failed to start Python backend: {}", e);
                    // Show error dialog
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        use tauri_plugin_dialog::DialogExt;
                        app_handle
                            .dialog()
                            .message(format!(
                                "Failed to start the backend server.\n\nError: {}\n\nMake sure 'uv' is installed and in your PATH.",
                                e
                            ))
                            .title("Solaria - Backend Error")
                            .blocking_show();
                        std::process::exit(1);
                    });
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill Python backend on window close
                if let Some(backend) = window.try_state::<PythonBackend>() {
                    if let Ok(mut guard) = backend.0.lock() {
                        if let Some(mut child) = guard.take() {
                            log::info!("Shutting down Python backend...");
                            let _ = child.kill();
                            let _ = child.wait();
                            log::info!("Python backend stopped.");
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_config_path_returns_pathbuf() {
        let path = get_config_path();
        // Should return some path (either env var, config dir, or fallback)
        assert!(!path.as_os_str().is_empty());
    }

    #[test]
    fn get_config_path_respects_env_var() {
        // Set environment variable
        std::env::set_var("SOLARIA_CONFIG", "/tmp/test-config.toml");
        let path = get_config_path();
        assert_eq!(path, PathBuf::from("/tmp/test-config.toml"));
        // Clean up
        std::env::remove_var("SOLARIA_CONFIG");
    }

    #[test]
    fn get_config_path_falls_back_to_local() {
        // Ensure env var is not set
        std::env::remove_var("SOLARIA_CONFIG");
        let path = get_config_path();
        // If ~/.config/solaria/config.toml doesn't exist, should fall back to ./config.toml
        assert!(path.to_string_lossy().ends_with("config.toml"));
    }
}
