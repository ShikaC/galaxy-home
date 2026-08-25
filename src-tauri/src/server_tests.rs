use super::{
    http_response_is_success, normalize_node_path, packaged_runtime_root, read_ready_signal,
    ready_line_capability,
};
use std::io::Cursor;
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
fn normalizes_windows_extended_paths_before_starting_node() {
    let extended = PathBuf::from(r"\\?\C:\Galaxy Home\resources\app");
    let normalized = normalize_node_path(extended);

    #[cfg(windows)]
    assert_eq!(normalized, PathBuf::from(r"C:\Galaxy Home\resources\app"));
    #[cfg(not(windows))]
    assert_eq!(
        normalized,
        PathBuf::from(r"\\?\C:\Galaxy Home\resources\app")
    );
}

#[test]
fn normalizes_windows_extended_unc_paths_before_starting_node() {
    let extended = PathBuf::from(r"\\?\UNC\server\share\app");
    let normalized = normalize_node_path(extended);

    #[cfg(windows)]
    assert_eq!(normalized, PathBuf::from(r"\\server\share\app"));
    #[cfg(not(windows))]
    assert_eq!(normalized, PathBuf::from(r"\\?\UNC\server\share\app"));
}

#[test]
fn accepts_only_successful_http_readiness_responses() {
    assert!(http_response_is_success(b"HTTP/1.1 200 OK\r\n"));
    assert!(http_response_is_success(b"HTTP/1.0 200 OK\r\n"));
    assert!(!http_response_is_success(b"HTTP/1.1 404 Not Found\r\n"));
}

#[test]
fn requires_the_child_ready_signal_for_the_expected_port() {
    assert_eq!(
        ready_line_capability("GALAXY_HOME_READY 4177 startup-token\n", 4177),
        Some("startup-token".to_string())
    );
    assert_eq!(
        ready_line_capability("GALAXY_HOME_READY 4177\n", 4177),
        None
    );
    assert_eq!(
        ready_line_capability("GALAXY_HOME_READY 4178 startup-token\n", 4177),
        None
    );
}

#[test]
fn finds_the_ready_signal_after_non_protocol_stdout_lines() {
    let stdout = Cursor::new(
        "Server listening at http://127.0.0.1:4177\nGALAXY_HOME_READY 4177 startup-token\n",
    );

    assert_eq!(
        read_ready_signal(stdout, 4177),
        Ok(Some("startup-token".to_string()))
    );
}
