use std::ffi::{OsStr, OsString};

pub(crate) fn is_node_tooling_environment_key(key: &OsStr) -> bool {
    let normalized = key.to_string_lossy().to_ascii_uppercase();
    normalized.starts_with("NODE_") || normalized.starts_with("NPM_")
}

pub(crate) fn sanitized_environment() -> Vec<(OsString, OsString)> {
    std::env::vars_os()
        .filter(|(key, _)| !is_node_tooling_environment_key(key))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::is_node_tooling_environment_key;
    use std::ffi::OsStr;

    #[test]
    fn removes_inherited_node_and_npm_tooling_environment_keys() {
        assert!(is_node_tooling_environment_key(OsStr::new("NODE_OPTIONS")));
        assert!(is_node_tooling_environment_key(OsStr::new("node_path")));
        assert!(is_node_tooling_environment_key(OsStr::new(
            "npm_lifecycle_script"
        )));
        assert!(!is_node_tooling_environment_key(OsStr::new("Path")));
        assert!(!is_node_tooling_environment_key(OsStr::new(
            "GALAXY_DATA_DIR"
        )));
    }
}
