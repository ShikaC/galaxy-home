use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, TryRecvError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, Url};

use crate::{app_data, node_environment, node_runtime};

const PORT_RANGE: std::ops::RangeInclusive<u16> = 4177..=4199;
const PORT_IN_USE_EXIT_CODE: i32 = 98;
const STARTUP_ATTEMPTS: usize = 75;

pub struct ServerProcess(pub Mutex<Option<Child>>);

enum PortWaitError {
    InUse,
    Failed(String),
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri parent")
        .to_path_buf()
}

fn packaged_runtime_root(resource_dir: PathBuf) -> PathBuf {
    resource_dir.join("resources").join("app")
}

fn normalize_node_path(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let value = path.to_string_lossy();
        if let Some(unc) = value.strip_prefix("\\\\?\\UNC\\") {
            return PathBuf::from(format!("\\\\{unc}"));
        }
        if let Some(normal) = value.strip_prefix("\\\\?\\") {
            return PathBuf::from(normal);
        }
    }
    path
}

fn runtime_root(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        return project_root();
    }
    normalize_node_path(packaged_runtime_root(
        app.path().resource_dir().expect("resource dir"),
    ))
}

fn http_response_is_success(response: &[u8]) -> bool {
    response.starts_with(b"HTTP/1.1 200") || response.starts_with(b"HTTP/1.0 200")
}

fn http_ready_once(port: u16, path: &str) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
    let request =
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    let mut response = [0; 256];
    stream.write_all(request.as_bytes()).is_ok()
        && stream
            .read(&mut response)
            .is_ok_and(|size| http_response_is_success(&response[..size]))
}

fn wait_for_http(port: u16, path: &str) -> bool {
    for _ in 0..STARTUP_ATTEMPTS {
        if http_ready_once(port, path) {
            return true;
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

pub fn wait_for_dev_services() -> Result<(), std::io::Error> {
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

fn spawn_galaxy_server(app: &AppHandle, port: u16) -> Result<Child, String> {
    let data_dir = normalize_node_path(
        app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?,
    );
    app_data::ensure_writable(&data_dir)?;

    let root = runtime_root(app);
    let entry = root.join("dist/server/index.js");
    if !entry.is_file() {
        return Err(format!(
            "找不到服务入口：{}（请先 npm run build / desktop:prepare）",
            entry.display()
        ));
    }

    let node = normalize_node_path(node_runtime::find_node_binary()?);
    let mut command = Command::new(node);
    command.env_clear();
    for (key, value) in node_environment::sanitized_environment() {
        command.env(key, value);
    }
    command
        .current_dir(&root)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("GALAXY_DATA_DIR", &data_dir)
        .env("GALAXY_PARENT_LIFETIME", "1")
        .arg(&entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法启动 Node 服务（需本机 Node ≥24）：{error}"))
}

fn ready_line_capability(line: &str, port: u16) -> Option<String> {
    let mut fields = line.trim_end_matches(['\r', '\n']).split_whitespace();
    let expected_port = port.to_string();
    if fields.next() != Some("GALAXY_HOME_READY") || fields.next() != Some(expected_port.as_str()) {
        return None;
    }
    let capability = fields.next()?;
    if fields.next().is_some()
        || capability.is_empty()
        || !capability
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return None;
    }
    Some(capability.to_string())
}

fn read_ready_signal<R: BufRead>(reader: R, port: u16) -> Result<Option<String>, String> {
    for line in reader.lines() {
        let line = line.map_err(|error| format!("无法读取银河居所服务就绪信号：{error}"))?;
        if let Some(capability) = ready_line_capability(&line, port) {
            return Ok(Some(capability));
        }
    }
    Ok(None)
}

fn classify_child_exit(status: ExitStatus, port: u16) -> PortWaitError {
    if status.code() == Some(PORT_IN_USE_EXIT_CODE) {
        PortWaitError::InUse
    } else {
        PortWaitError::Failed(format!(
            "银河居所服务启动后立即退出（状态码：{status}，端口：{port}）"
        ))
    }
}

fn wait_for_port(child: &mut Child, port: u16) -> Result<String, PortWaitError> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| PortWaitError::Failed("无法读取银河居所服务就绪信号".into()))?;
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let result = read_ready_signal(BufReader::new(stdout), port);
        let _ = sender.send(result);
    });

    let mut capability = None;
    for _ in 0..STARTUP_ATTEMPTS {
        if capability.is_none() {
            match receiver.try_recv() {
                Ok(Ok(Some(value))) => capability = Some(value),
                Ok(Ok(None)) => {
                    return match child.try_wait() {
                        Ok(Some(status)) => Err(classify_child_exit(status, port)),
                        Ok(None) => Err(PortWaitError::Failed("银河居所服务未返回就绪信号".into())),
                        Err(error) => Err(PortWaitError::Failed(format!(
                            "无法检查银河居所服务状态：{error}"
                        ))),
                    };
                }
                Ok(Err(error)) => {
                    return Err(PortWaitError::Failed(error));
                }
                Err(TryRecvError::Empty) => {}
                Err(TryRecvError::Disconnected) => {
                    return Err(PortWaitError::Failed("银河居所服务就绪信号已断开".into()))
                }
            }
        }
        match child.try_wait() {
            Ok(Some(status)) => return Err(classify_child_exit(status, port)),
            Ok(None) => {}
            Err(error) => {
                return Err(PortWaitError::Failed(format!(
                    "无法检查银河居所服务状态：{error}"
                )))
            }
        }
        if let Some(value) = capability.as_ref() {
            if http_ready_once(port, "/api/health") {
                return Ok(value.clone());
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err(PortWaitError::Failed(format!(
        "银河居所服务未能在 127.0.0.1:{port} 就绪"
    )))
}

pub fn start_server(app: &AppHandle) -> Result<(Child, u16, String), String> {
    for port in PORT_RANGE {
        let mut child = spawn_galaxy_server(app, port)?;
        match wait_for_port(&mut child, port) {
            Ok(capability) => return Ok((child, port, capability)),
            Err(PortWaitError::InUse) => stop_server(&mut child),
            Err(PortWaitError::Failed(error)) => {
                stop_server(&mut child);
                return Err(error);
            }
        }
    }
    Err("本机 4177–4199 端口均不可用，请关闭占用进程后重试".into())
}

pub fn stop_server(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

pub fn show_main_window(app: &AppHandle, port: u16, capability: &str) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let url = Url::parse(&format!("http://127.0.0.1:{port}/#capability={capability}"))
        .map_err(|error| error.to_string())?;
    window.navigate(url).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
#[path = "server_tests.rs"]
mod tests;
