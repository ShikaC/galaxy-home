//! 托盘图标与关窗行为。
//!
//! 提醒只有进程活着才能投递，所以关窗只隐藏窗口、不退出进程；显式退出只留托盘菜单一个入口。
//! 没有这个入口的话，用户会遇到“关了窗口却退不掉”的问题。

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Window, WindowEvent};

pub const REVEAL_MENU_ID: &str = "reveal";
pub const QUIT_MENU_ID: &str = "quit";
const TRAY_ID: &str = "galaxy-tray";

pub fn reveal_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 关窗请求一律转为隐藏。真正的退出走 `AppHandle::exit`，它不经过窗口关闭事件，
/// 所以托盘里的“退出”不会被这里拦下。
pub fn hide_instead_of_closing(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let reveal = MenuItem::with_id(app, REVEAL_MENU_ID, "显示银河居所", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_MENU_ID, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&reveal, &quit])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        // 左键直接开窗口，菜单留给右键，和系统托盘的习惯一致。
        .show_menu_on_left_click(false)
        .tooltip("银河居所")
        .on_menu_event(|app, event| match event.id.as_ref() {
            REVEAL_MENU_ID => reveal_main_window(app),
            QUIT_MENU_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{QUIT_MENU_ID, REVEAL_MENU_ID};

    #[test]
    fn menu_ids_are_distinct_and_stable() {
        // 这两个字符串是菜单事件的分派键，写错会让托盘按钮失效且没有编译期提示。
        assert_ne!(REVEAL_MENU_ID, QUIT_MENU_ID);
        assert_eq!(REVEAL_MENU_ID, "reveal");
        assert_eq!(QUIT_MENU_ID, "quit");
    }
}
