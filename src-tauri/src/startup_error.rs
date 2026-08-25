use tauri::{Manager, Url};

pub(super) fn show_startup_error(app: &tauri::AppHandle, error: &str) -> Result<(), String> {
  let window = app
    .get_webview_window("main")
    .ok_or_else(|| "找不到主窗口".to_string())?;
  let error_html = html_escape(error);
  let html = format!(
    r#"<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>银河居所 - 启动失败</title>
    <style>
      :root {{ color-scheme: light; font-family: system-ui, sans-serif; }}
      body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f4ef; color: #272522; }}
      main {{ width: min(560px, calc(100vw - 48px)); padding: 32px; border: 1px solid #d8d2c8; background: #fffdf9; box-shadow: 0 12px 32px rgb(39 37 34 / 10%); }}
      h1 {{ margin: 0 0 12px; font-size: 24px; }}
      p {{ margin: 0; line-height: 1.6; white-space: pre-wrap; }}
    </style>
  </head>
  <body>
    <main>
      <h1>银河居所无法启动</h1>
      <p>{error_html}</p>
    </main>
  </body>
</html>"#
  );
  let encoded = percent_encode(html.as_bytes());
  let url = Url::parse(&format!("data:text/html;charset=utf-8,{encoded}"))
    .map_err(|error| error.to_string())?;
  window
    .set_title("银河居所 - 启动失败")
    .map_err(|error| error.to_string())?;
  window.show().map_err(|error| error.to_string())?;
  window.navigate(url).map_err(|error| error.to_string())?;
  Ok(())
}

fn html_escape(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
    .replace('\'', "&#39;")
}

fn percent_encode(value: &[u8]) -> String {
  const HEX: &[u8; 16] = b"0123456789ABCDEF";
  let mut encoded = String::with_capacity(value.len());
  for byte in value {
    if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
      encoded.push(*byte as char);
    } else {
      encoded.push('%');
      encoded.push(HEX[(byte >> 4) as usize] as char);
      encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
  }
  encoded
}

#[cfg(test)]
mod tests {
  use super::{html_escape, percent_encode};

  #[test]
  fn startup_error_content_is_escaped_and_percent_encoded() {
    let error = html_escape("Node <24 & unavailable");
    let html = format!("<p>{error}</p>");

    assert_eq!(html, "<p>Node &lt;24 &amp; unavailable</p>");
    assert!(percent_encode(html.as_bytes()).contains("%3C%2Fp%3E"));
    assert!(!percent_encode(html.as_bytes()).contains('<'));
  }
}
