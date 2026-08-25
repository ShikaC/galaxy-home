use std::fs::{self, OpenOptions};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn ensure_writable(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("无法创建或写入应用数据目录：{error}"))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("无法创建或写入应用数据目录：{error}"))?
        .as_nanos();
    let probe_path = path.join(format!(
        ".galaxy-write-probe-{}-{timestamp}",
        std::process::id()
    ));
    let probe = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe_path)
        .map_err(|error| format!("无法创建或写入应用数据目录：{error}"))?;
    drop(probe);
    fs::remove_file(probe_path).map_err(|error| format!("无法创建或写入应用数据目录：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ensure_writable;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reports_a_clear_error_when_the_app_data_path_is_not_a_directory() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("galaxy-app-data-file-{timestamp}"));
        fs::write(&path, b"not a directory").expect("create blocking file");

        let result = ensure_writable(&path);

        fs::remove_file(path).expect("remove blocking file");
        let error = result.expect_err("file path must be rejected");
        assert!(error.starts_with("无法创建或写入应用数据目录："));
    }
}
