mod commands;
mod dossier_db;
mod rvf_inspector;

use commands::AppState;
use dossier_db::DossierDb;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri::Url;
use wyr_core::GameEngine;

fn resolve_db_path() -> PathBuf {
    let dossier_db = PathBuf::from(".dossier/local.db");
    if dossier_db.exists() {
        return dossier_db;
    }
    if let Some(data_dir) = app_data_dir() {
        let db_path = data_dir.join("dossier.db");
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        return db_path;
    }
    PathBuf::from("dossier-desktop.db")
}

fn app_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|p| PathBuf::from(p).join("Dossier"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME")
            .ok()
            .map(|p| PathBuf::from(p).join("Library/Application Support/Dossier"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("HOME")
            .ok()
            .map(|p| PathBuf::from(p).join(".local/share/dossier"))
    }
}

/// Strip Windows \\?\ prefix that breaks Node.js.
fn strip_unc_prefix(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        p
    }
}

/// Locate the Next.js standalone directory.
fn find_standalone_dir() -> Option<PathBuf> {
    // Check env override first
    if let Ok(dir) = std::env::var("DOSSIER_STANDALONE") {
        let p = PathBuf::from(dir);
        if p.join("server.js").exists() {
            return Some(p);
        }
    }

    // Dev mode: relative paths from various working directories
    let candidates = [
        PathBuf::from("../.next/standalone"),
        PathBuf::from("../../.next/standalone"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.next/standalone"),
    ];

    for candidate in &candidates {
        if candidate.join("server.js").exists() {
            // Canonicalize to absolute path, but strip \\?\ prefix
            return std::fs::canonicalize(candidate)
                .map(strip_unc_prefix)
                .ok();
        }
    }
    None
}

/// Find node executable on the system.
fn find_node() -> String {
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            "C:\\Program Files\\nodejs\\node.exe",
            "C:\\Program Files (x86)\\nodejs\\node.exe",
        ];
        for c in &candidates {
            if std::path::Path::new(c).exists() {
                return c.to_string();
            }
        }
        // Search PATH
        if let Ok(path) = std::env::var("PATH") {
            for dir in path.split(';') {
                let candidate = PathBuf::from(dir).join("node.exe");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(path) = std::env::var("PATH") {
            for dir in path.split(':') {
                let candidate = PathBuf::from(dir).join("node");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
    }
    "node".to_string()
}

/// Wait for a TCP port to become available.
fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(format!("127.0.0.1:{port}")).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

/// Find an available port starting from the given port.
fn find_free_port(start: u16) -> u16 {
    for port in start..start + 100 {
        if std::net::TcpListener::bind(format!("127.0.0.1:{port}")).is_ok() {
            return port;
        }
    }
    start
}

struct NextServer {
    process: Child,
    port: u16,
}

impl Drop for NextServer {
    fn drop(&mut self) {
        let _ = self.process.kill();
    }
}

/// Start the Next.js standalone server.
fn start_next_server() -> Result<NextServer, String> {
    let standalone_dir = find_standalone_dir()
        .ok_or("Next.js standalone build not found. Run 'pnpm run build' in the Dossier root first.")?;

    let server_js = standalone_dir.join("server.js");
    let node = find_node();
    let port = find_free_port(3000);

    // Resolve the data directory for Dossier
    let data_dir = app_data_dir()
        .unwrap_or_else(|| PathBuf::from(".dossier"));
    let _ = std::fs::create_dir_all(&data_dir);

    println!("[dossier-desktop] Node: {node}");
    println!("[dossier-desktop] Standalone dir: {}", standalone_dir.display());
    println!("[dossier-desktop] Server.js: {}", server_js.display());
    println!("[dossier-desktop] Port: {port}");

    let child = Command::new(&node)
        .arg(&server_js)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("DOSSIER_DATA_DIR", data_dir.to_string_lossy().to_string())
        .current_dir(&standalone_dir)
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start Node.js server ({node}): {e}"))?;

    // Wait up to 30 seconds for the server to be ready
    if !wait_for_port(port, Duration::from_secs(30)) {
        return Err(format!("Next.js server did not start within 30 seconds on port {port}"));
    }

    Ok(NextServer {
        process: child,
        port,
    })
}

pub fn run() {
    let db_path = resolve_db_path();
    let db = DossierDb::open_or_create(&db_path)
        .unwrap_or_else(|e| panic!("Failed to open Dossier database at {}: {e}", db_path.display()));

    let state = AppState {
        engine: Mutex::new(GameEngine::new()),
        db,
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            // WYR Game
            commands::get_question,
            commands::submit_answer,
            commands::reset_game,
            commands::get_stats,
            commands::get_progress,
            commands::get_hnsw_stats,
            // Dossier Projects (Rust-side DB)
            commands::list_projects,
            commands::get_map_snapshot,
            commands::create_project,
            commands::create_workflow,
            commands::create_activity,
            commands::create_card,
            commands::update_card,
            commands::delete_card,
            commands::delete_activity,
            commands::delete_workflow,
            // RVF Inspector
            commands::inspect_rvf,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main")
                .expect("main window not found");

            // Start the Next.js server in a background thread
            let window_clone = window.clone();
            std::thread::spawn(move || {
                match start_next_server() {
                    Ok(server) => {
                        let url = format!("http://127.0.0.1:{}", server.port);
                        println!("[dossier-desktop] Next.js server ready at {url}");

                        // Navigate the webview to the Next.js app
                        if let Ok(parsed) = Url::parse(&url) {
                            let _ = window_clone.navigate(parsed);
                        }

                        // Keep the server alive for the lifetime of the app
                        // by leaking it (Drop will kill it on process exit)
                        std::mem::forget(server);
                    }
                    Err(e) => {
                        eprintln!("[dossier-desktop] Failed to start Next.js: {e}");
                        let _ = window_clone.eval(format!(
                            "document.body.innerHTML = '<div style=\"display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;text-align:center;padding:2em\"><div><h2>Dossier Desktop</h2><p style=\"color:#e44\">Failed to start the application server.</p><p style=\"color:#888;font-size:0.9em\">{}</p><p style=\"color:#888;font-size:0.85em\">Make sure you have built the Next.js app:<br><code>pnpm run build</code> in the Dossier root directory.</p></div></div>'",
                            e.replace('\'', "\\'").replace('"', "&quot;")
                        ).as_str());
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
