//! 平台投递驱动：窗口关闭后进程仍驻留，由这里把到期提醒转成系统通知。
//!
//! 服务端把“应用内横幅”和“平台投递”记成两条互不影响的通道，本模块只走后者：
//! 每次领取都会把领取到的提醒标记为已投递，所以重复轮询不会重复弹同一批。
//! 完全退出后的定时投递不在这里：`tauri-plugin-notification` 在桌面端接受
//! `Schedule` 但不消费它（`show()` 只读 title/body/icon/sound），需要各平台自写原生代码。

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// 轮询间隔。提醒的语义精度是分钟，30 秒足够及时又不会让空闲的桌面进程频繁唤醒。
pub const POLL_INTERVAL: Duration = Duration::from_secs(30);
const READ_TIMEOUT: Duration = Duration::from_secs(10);
/// 服务端一次最多返回 20 条；留出头部空间即可，避免无上限读取。
const MAX_RESPONSE_BYTES: usize = 256 * 1024;

const PLATFORM_PATH: &str = "/api/notifications/platform";

#[derive(Debug, Deserialize)]
pub struct PlatformNotification {
    pub title: String,
    pub detail: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum HttpOutcome {
    Ok(String),
    /// 服务端还没起来、端口换了或连接被拒；下一轮再试。
    Unreachable,
    /// 服务端答了但不是 200；带上状态行便于排查（例如能力令牌不符时的 401）。
    Status(String),
}

fn build_request(port: u16, capability: Option<&str>) -> String {
    let cookie = match capability {
        Some(value) if !value.is_empty() => format!("Cookie: galaxy_capability={value}\r\n"),
        _ => String::new(),
    };
    format!(
        "POST {PLATFORM_PATH} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{cookie}Content-Length: 0\r\nConnection: close\r\n\r\n"
    )
}

/// 拆出状态行与响应体。用 `Connection: close`，读到 EOF 即完整响应，
/// 因此不依赖 Content-Length，也不需要考虑分块。
pub fn split_response(raw: &str) -> (String, String) {
    match raw.split_once("\r\n\r\n") {
        Some((head, body)) => (
            head.lines().next().unwrap_or_default().to_string(),
            body.to_string(),
        ),
        None => (
            raw.lines().next().unwrap_or_default().to_string(),
            String::new(),
        ),
    }
}

pub fn is_success(status_line: &str) -> bool {
    status_line.starts_with("HTTP/1.1 200") || status_line.starts_with("HTTP/1.0 200")
}

/// 解析服务端返回的提醒数组。解析失败按“这一批先不弹”处理：
/// 投递身份已经被服务端标记，重试也拿不到同一批，所以宁可少弹也不要弹错内容。
pub fn parse_notifications(body: &str) -> Option<Vec<PlatformNotification>> {
    serde_json::from_str::<Vec<PlatformNotification>>(body).ok()
}

pub fn claim(port: u16, capability: Option<&str>) -> HttpOutcome {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return HttpOutcome::Unreachable;
    };
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_write_timeout(Some(READ_TIMEOUT));
    if stream
        .write_all(build_request(port, capability).as_bytes())
        .is_err()
    {
        return HttpOutcome::Unreachable;
    }
    let mut raw = Vec::new();
    let mut buffer = [0u8; 8192];
    loop {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(size) => {
                raw.extend_from_slice(&buffer[..size]);
                if raw.len() > MAX_RESPONSE_BYTES {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    let (status_line, body) = split_response(&String::from_utf8_lossy(&raw));
    if is_success(&status_line) {
        HttpOutcome::Ok(body)
    } else if status_line.is_empty() {
        HttpOutcome::Unreachable
    } else {
        HttpOutcome::Status(status_line)
    }
}

pub struct Driver {
    port: u16,
    capability: Option<String>,
    stop: Arc<AtomicBool>,
}

impl Driver {
    pub fn new(port: u16, capability: Option<String>) -> Self {
        Self {
            port,
            capability,
            stop: Arc::new(AtomicBool::new(false)),
        }
    }

    /// 一次投递周期，返回实际弹出条数。抽成独立方法是为了能在测试里直接驱动。
    pub fn deliver_once(&self, app: &AppHandle) -> usize {
        let HttpOutcome::Ok(body) = claim(self.port, self.capability.as_deref()) else {
            return 0;
        };
        let Some(notifications) = parse_notifications(&body) else {
            return 0;
        };
        let mut shown = 0;
        for notification in notifications {
            if app
                .notification()
                .builder()
                .title(&notification.title)
                .body(&notification.detail)
                .show()
                .is_ok()
            {
                shown += 1;
            }
        }
        shown
    }

    pub fn start(self, app: AppHandle) {
        thread::spawn(move || {
            while !self.stop.load(Ordering::Relaxed) {
                self.deliver_once(&app);
                thread::sleep(POLL_INTERVAL);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_carries_the_capability_cookie_only_in_desktop_mode() {
        let with_capability = build_request(4177, Some("abc123"));
        assert!(with_capability.starts_with("POST /api/notifications/platform HTTP/1.1\r\n"));
        assert!(with_capability.contains("Cookie: galaxy_capability=abc123\r\n"));
        assert!(with_capability.ends_with("\r\n\r\n"));

        // 开发模式下服务端不设能力令牌，带一个空 Cookie 会被判成无效会话。
        let dev = build_request(3010, None);
        assert!(!dev.contains("Cookie:"));
        assert!(build_request(3010, Some("")).find("Cookie:").is_none());
    }

    #[test]
    fn response_splits_on_the_blank_line_not_on_content_length() {
        let raw = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n[{\"title\":\"a\"}]";
        let (status, body) = split_response(raw);
        assert_eq!(status, "HTTP/1.1 200 OK");
        assert_eq!(body, "[{\"title\":\"a\"}]");
        assert!(is_success(&status));

        // 连接被对端提前关掉时头部可能不完整，此时不应把半个头当成正文。
        let truncated = "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json";
        let (status, body) = split_response(truncated);
        assert_eq!(status, "HTTP/1.1 401 Unauthorized");
        assert_eq!(body, "");
        assert!(!is_success(&status));

        assert_eq!(split_response("").0, "");
    }

    #[test]
    fn parses_the_notification_array_the_route_returns() {
        let body = r#"[{"id":"a","reminderId":"b","kind":"morning","title":"今天最想推进什么？","detail":"记下此刻想到的一件事。","scheduledAt":"2026-08-04T02:00:00.000Z","entityId":null}]"#;
        let parsed = parse_notifications(body).expect("应能解析");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].title, "今天最想推进什么？");
        assert_eq!(parsed[0].detail, "记下此刻想到的一件事。");
    }

    #[test]
    fn refuses_to_show_a_batch_it_cannot_parse() {
        // 空数组是正常的“没有到期提醒”，不是解析失败。
        assert_eq!(parse_notifications("[]").map(|rows| rows.len()), Some(0));
        // 非法 JSON 与结构不符都要拒掉，避免用空标题去弹系统通知。
        assert!(parse_notifications("").is_none());
        assert!(parse_notifications("{\"error\":\"boom\"}").is_none());
        assert!(parse_notifications("[{\"id\":\"a\"}]").is_none());
    }

    /// 真实服务端联调。单元测试只能证明请求长什么样，证明不了服务端认它。
    ///
    /// 先在仓库根目录跑 `npm run build`。时钟必须钉死：空库的默认提醒是本地 09:00，
    /// 不钉时钟的话，“有没有到期提醒”取决于跑测试的那一刻。
    ///
    /// ```text
    /// sleep 600 | GALAXY_DATA_DIR=$(mktemp -d) GALAXY_PARENT_LIFETIME=1 \
    ///   GALAXY_CLOCK_NOW=2026-08-04T02:00:00.000Z NODE_ENV=production PORT=4198 \
    ///   node dist/server/index.js
    /// ```
    ///
    /// `sleep 600` 是必需的：`GALAXY_PARENT_LIFETIME=1` 会盯 stdin，
    /// stdin 一结束服务就关。从输出的 `GALAXY_HOME_READY <port> <capability>`
    /// 取两个值，再跑：
    ///
    /// ```text
    /// cd src-tauri
    /// GALAXY_IT_PORT=4198 GALAXY_IT_CAPABILITY=<capability> \
    ///   cargo test -- --ignored --nocapture platform_delivery
    /// ```
    ///
    /// 故意不写成“缺环境变量就跳过”：那样忘了设变量会假装通过。
    #[test]
    #[ignore = "需要真实运行的服务端，步骤见上方注释"]
    fn platform_delivery_against_a_running_server() {
        let port: u16 = std::env::var("GALAXY_IT_PORT")
            .expect("需要 GALAXY_IT_PORT")
            .parse()
            .expect("GALAXY_IT_PORT 不是端口");
        let capability = std::env::var("GALAXY_IT_CAPABILITY").expect("需要 GALAXY_IT_CAPABILITY");

        let first = claim(port, Some(&capability));
        let HttpOutcome::Ok(body) = first else {
            panic!("带能力令牌的领取应当成功，实际：{first:?}");
        };
        let claimed = parse_notifications(&body).expect("服务端响应应能解析成提醒数组");
        assert!(
            !claimed.is_empty(),
            "空库在 10:00（亚洲/上海）应有到期的晨间提醒；检查服务端是否设了 GALAXY_CLOCK_NOW"
        );
        println!(
            "首次领取 {} 条，首条标题：{}",
            claimed.len(),
            claimed[0].title
        );

        // 平台通道是一次性的：同一批不会第二次弹出系统通知。
        let HttpOutcome::Ok(second_body) = claim(port, Some(&capability)) else {
            panic!("第二次领取应当同样是 200");
        };
        assert_eq!(
            parse_notifications(&second_body).map(|rows| rows.len()),
            Some(0),
            "重复领取应返回空数组"
        );

        // 令牌不对必须被拒，否则本机任何页面都能读提醒。
        // 生产模式下 origin 门禁排在能力门禁之前，所以无 Origin 的裸请求是 403 而不是 401，
        // 两者都算拒绝；具体码位随两者顺序变化，不该钉在测试里。
        let rejected = |outcome: HttpOutcome| matches!(&outcome, HttpOutcome::Status(line) if line.contains("401") || line.contains("403"));
        assert!(rejected(claim(port, None)), "缺令牌必须被拒");
        assert!(rejected(claim(port, Some("wrong-token"))), "错令牌必须被拒");
    }
}
