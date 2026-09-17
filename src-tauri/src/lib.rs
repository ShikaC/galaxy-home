use std::sync::Mutex;

use tauri::{webview::PageLoadEvent, Manager, RunEvent};

mod app_data;
mod node_environment;
mod node_runtime;
mod notifications;
mod server;
mod startup_error;
mod tray;

use server::{show_main_window, start_server, stop_server, wait_for_dev_services, ServerProcess};

fn should_reveal_main_window(label: &str, event: PageLoadEvent) -> bool {
    label == "main" && event == PageLoadEvent::Finished
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
        .on_window_event(|window, event| tray::hide_instead_of_closing(window, event))
        .setup(|app| {
            tray::build(app.handle())?;
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
                // 开发模式下服务端不设能力令牌，端口由启动脚本固定。
                start_delivery(
                    app.handle(),
                    server::configured_port("API_PORT", 3010).map_err(std::io::Error::other)?,
                    None,
                );
                return Ok(());
            }

            let startup = (|| -> Result<(), String> {
                let (mut child, port, capability) = start_server(app.handle())?;
                show_main_window(app.handle(), port, &capability)
                    .inspect_err(|_| stop_server(&mut child))?;
                *app.state::<ServerProcess>().0.lock().expect("server lock") = Some(child);
                start_delivery(app.handle(), port, Some(capability));
                Ok(())
            })();
            if let Err(error) = startup {
                if startup_error::show_startup_error(app.handle(), &error).is_err() {
                    app.handle().exit(1);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::Exit => {
                if let Some(state) = app.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            stop_server(&mut child);
                        }
                    }
                }
            }
            // macOS 点 Dock 图标时窗口可能正被隐藏，用户预期是重新看到窗口。
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => tray::reveal_main_window(app),
            _ => {}
        });
}

/// 启动平台投递。
///
/// 桌面端 `request_permission` 恒返回 `Granted`（真正的授权由系统在首次显示时裁决），
/// 所以这里不做门禁、也不把权限状态写成前置条件；权限被拒时提醒仍然出现在应用内横幅。
fn start_delivery(app: &tauri::AppHandle, port: u16, capability: Option<String>) {
    log::info!(
        "平台投递已启动，端口 {port}，能力令牌{}",
        if capability.is_some() {
            "已加载"
        } else {
            "未使用"
        }
    );
    notifications::Driver::new(port, capability).start(app.clone());
}

#[cfg(test)]
mod tests {
    use super::should_reveal_main_window;
    use tauri::webview::PageLoadEvent;

    #[test]
    fn main_window_reveals_only_after_finished_page_load() {
        assert!(!should_reveal_main_window("main", PageLoadEvent::Started));
        assert!(should_reveal_main_window("main", PageLoadEvent::Finished));
        assert!(!should_reveal_main_window(
            "secondary",
            PageLoadEvent::Finished
        ));
    }
}
