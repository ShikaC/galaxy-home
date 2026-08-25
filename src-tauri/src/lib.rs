use std::sync::Mutex;

use tauri::{webview::PageLoadEvent, Manager, RunEvent};

mod app_data;
mod node_environment;
mod node_runtime;
mod server;
mod startup_error;

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

            let startup = (|| -> Result<(), String> {
                let (mut child, port, capability) = start_server(app.handle())?;
                show_main_window(app.handle(), port, &capability)
                    .inspect_err(|_| stop_server(&mut child))?;
                *app.state::<ServerProcess>().0.lock().expect("server lock") = Some(child);
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
