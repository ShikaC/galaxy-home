use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{webview::PageLoadEvent, Manager, RunEvent, Url};

const PORT_RANGE: std::ops::RangeInclusive<u16> = 4177..=4199;

struct ServerProcess(Mutex<Option<Child>>);

fn project_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("src-tauri parent")
    .to_path_buf()
}

fn packaged_runtime_root(resource_dir: PathBuf) -> PathBuf {
  resource_dir.join("resources").join("app")
}

fn should_reveal_main_window(label: &str, event: PageLoadEvent) -> bool {
  label == "main" && event == PageLoadEvent::Finished
}

fn runtime_root(app: &tauri::AppHandle) -> PathBuf {
  if cfg!(debug_assertions) {
    return project_root();
  }
  packaged_runtime_root(app.path().resource_dir().expect("resource dir"))
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

fn wait_for_http(port: u16, path: &str) -> bool {
  for _ in 0..75 {
    if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) {
      let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
      let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
      );
      let mut response = [0; 256];
      if stream.write_all(request.as_bytes()).is_ok()
        && stream.read(&mut response).is_ok_and(|size| {
          response[..size].starts_with(b"HTTP/1.1 200")
            || response[..size].starts_with(b"HTTP/1.0 200")
        })
      {
        return true;
      }
    }
    thread::sleep(Duration::from_millis(200));
  }
  false
}

fn configured_port(name: &str, fallback: u16) -> Result<u16, String> {
  match std::env::var(name) {
    Ok(value) => value
      .parse()
      .map_err(|_| format!("桌面环境变量 {name} 不是有效端口：{value}")),
    Err(_) => Ok(fallback),
  }
}

fn wait_for_dev_services() -> Result<(), std::io::Error> {
  let web_port = configured_port("VITE_PORT", 5180).map_err(std::io::Error::other)?;
  let api_port = configured_port("API_PORT", 3010).map_err(std::io::Error::other)?;
  if !wait_for_http(web_port, "/") {
    return Err(std::io::Error::other(format!(
      "桌面 Web 服务未能在 127.0.0.1:{web_port} 返回就绪响应"
    )));
  }
  if !wait_for_http(api_port, "/api/health") {
    return Err(std::io::Error::other(format!(
      "桌面 API 服务未能在 127.0.0.1:{api_port}/api/health 返回就绪响应"
    )));
  }
  Ok(())
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
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .manage(ServerProcess(Mutex::new(None)))
    .on_page_load(|webview, payload| {
      if !cfg!(debug_assertions)
        && should_reveal_main_window(webview.label(), payload.event())
      {
        let window = webview.window();
        let _ = window.show();
        let _ = window.set_focus();
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        wait_for_dev_services()?;
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

#[cfg(test)]
mod tests {
  use super::{packaged_runtime_root, should_reveal_main_window};
  use tauri::webview::PageLoadEvent;
  use std::path::PathBuf;

  #[test]
  fn packaged_runtime_root_matches_tauri_resource_layout() {
    let resource_dir = PathBuf::from("/Applications/银河居所.app/Contents/Resources");

    assert_eq!(
      packaged_runtime_root(resource_dir),
      PathBuf::from("/Applications/银河居所.app/Contents/Resources/resources/app")
    );
  }

  #[test]
  fn main_window_reveals_only_after_finished_page_load() {
    assert!(!should_reveal_main_window("main", PageLoadEvent::Started));
    assert!(should_reveal_main_window("main", PageLoadEvent::Finished));
    assert!(!should_reveal_main_window("secondary", PageLoadEvent::Finished));
  }
}
