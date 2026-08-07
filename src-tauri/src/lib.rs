use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{Manager, RunEvent, Url};

const PORT_RANGE: std::ops::RangeInclusive<u16> = 4177..=4199;

struct ServerProcess(Mutex<Option<Child>>);

fn project_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("src-tauri parent")
    .to_path_buf()
}

fn runtime_root(app: &tauri::AppHandle) -> PathBuf {
  if cfg!(debug_assertions) {
    return project_root();
  }
  app
    .path()
    .resource_dir()
    .expect("resource dir")
    .join("app")
}

fn find_free_port() -> Result<u16, String> {
  for port in PORT_RANGE {
    if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
      drop(listener);
      return Ok(port);
    }
  }
  Err("本机 4177–4199 端口均不可用，请关闭占用进程后重试".into())
}

fn wait_for_port(port: u16) -> bool {
  for _ in 0..75 {
    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
      return true;
    }
    thread::sleep(Duration::from_millis(200));
  }
  false
}

fn spawn_galaxy_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|error| error.to_string())?;
  std::fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;

  let root = runtime_root(app);
  let entry = root.join("dist/server/index.js");
  if !entry.is_file() {
    return Err(format!(
      "找不到服务入口：{}（请先 npm run build / desktop:prepare）",
      entry.display()
    ));
  }

  Command::new("node")
    .current_dir(&root)
    .env("NODE_ENV", "production")
    .env("PORT", port.to_string())
    .env("GALAXY_DATA_DIR", &data_dir)
    .arg(&entry)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|error| format!("无法启动 Node 服务（需本机 Node ≥24）：{error}"))
}

fn stop_server(child: &mut Child) {
  let _ = child.kill();
  let _ = child.wait();
}

fn show_main_window(app: &tauri::AppHandle, port: u16) -> Result<(), String> {
  let window = app
    .get_webview_window("main")
    .ok_or_else(|| "找不到主窗口".to_string())?;
  let url = Url::parse(&format!("http://127.0.0.1:{port}/"))
    .map_err(|error| error.to_string())?;
  window.navigate(url).map_err(|error| error.to_string())?;
  window.show().map_err(|error| error.to_string())?;
  let _ = window.set_focus();
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .manage(ServerProcess(Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.show();
        }
        return Ok(());
      }

      let port = find_free_port()?;
      let child = spawn_galaxy_server(app.handle(), port)?;
      if !wait_for_port(port) {
        let mut child = child;
        stop_server(&mut child);
        return Err(format!("银河居所服务未能在 127.0.0.1:{port} 就绪").into());
      }
      *app
        .state::<ServerProcess>()
        .0
        .lock()
        .expect("server lock") = Some(child);
      show_main_window(app.handle(), port)?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let RunEvent::Exit = event {
        if let Some(state) = app.try_state::<ServerProcess>() {
          if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
              stop_server(&mut child);
            }
          }
        }
      }
    });
}
