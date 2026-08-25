use std::path::{Path, PathBuf};
use std::process::Command;

const MIN_NODE_MAJOR: u32 = 24;

#[cfg(target_os = "macos")]
fn add_versioned_candidates(candidates: &mut Vec<PathBuf>, root: &Path, suffix: &Path) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    let mut version_dirs = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    version_dirs.sort();
    version_dirs.reverse();
    candidates.extend(version_dirs.into_iter().map(|path| path.join(suffix)));
}

fn executable_name() -> &'static str {
    #[cfg(windows)]
    {
        "node.exe"
    }
    #[cfg(not(windows))]
    {
        "node"
    }
}

fn candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("GALAXY_NODE_PATH") {
        candidates.push(PathBuf::from(path));
    }
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(
            std::env::split_paths(&path).map(|directory| directory.join(executable_name())),
        );
    }

    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/node"),
            PathBuf::from("/usr/local/bin/node"),
            PathBuf::from("/usr/bin/node"),
        ]);
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            candidates.extend([
                home.join(".local/share/mise/shims/node"),
                home.join(".volta/bin/node"),
                home.join(".asdf/shims/node"),
            ]);
            add_versioned_candidates(
                &mut candidates,
                &home.join(".local/share/mise/installs/node"),
                Path::new("bin/node"),
            );
            add_versioned_candidates(
                &mut candidates,
                &home.join(".nvm/versions/node"),
                Path::new("bin/node"),
            );
            add_versioned_candidates(
                &mut candidates,
                &home.join(".local/share/fnm/node-versions"),
                Path::new("installation/bin/node"),
            );
        }
    }

    candidates
}

fn parse_node_major_version(output: &str) -> Option<u32> {
    output
        .trim()
        .strip_prefix('v')?
        .split('.')
        .next()?
        .parse()
        .ok()
}

fn node_major_version(path: &Path) -> Option<u32> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_node_major_version(&String::from_utf8_lossy(&output.stdout))
}

fn first_supported_candidate(
    candidates: impl IntoIterator<Item = PathBuf>,
    version_of: impl Fn(&Path) -> Option<u32>,
) -> Option<PathBuf> {
    candidates.into_iter().find(|path| {
        path.is_file() && version_of(path).is_some_and(|major| major >= MIN_NODE_MAJOR)
    })
}

pub(crate) fn find_node_binary() -> Result<PathBuf, String> {
    first_supported_candidate(candidates(), node_major_version)
    .ok_or_else(|| {
      "无法定位满足 Node.js ≥24 的运行时；请设置 GALAXY_NODE_PATH 或将 Node 加入桌面端可见的 PATH".into()
    })
}

#[cfg(test)]
mod tests {
    use super::{first_supported_candidate, parse_node_major_version};
    use std::path::PathBuf;

    #[test]
    fn selects_the_first_existing_binary_candidate() {
        let existing = std::env::current_exe().expect("current test executable");
        let missing = existing.with_file_name("missing-node-binary");

        assert_eq!(
            first_supported_candidate([missing, existing.clone()], |path| {
                (path == existing).then_some(24)
            }),
            Some(existing)
        );
        assert_eq!(
            first_supported_candidate([PathBuf::from("missing-node-a")], |_| Some(24)),
            None
        );
    }

    #[test]
    fn parses_node_major_version_from_node_output() {
        assert_eq!(parse_node_major_version("v24.14.0\n"), Some(24));
        assert_eq!(parse_node_major_version("v22.17.0\r\n"), Some(22));
        assert_eq!(parse_node_major_version("node 24.14.0"), None);
    }

    #[test]
    fn skips_existing_node_candidates_below_the_minimum_version() {
        let old = std::env::current_exe().expect("current test executable");
        let new = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");

        assert_eq!(
            first_supported_candidate([old.clone(), new.clone()], |path| {
                (path == old)
                    .then_some(22)
                    .or_else(|| (path == new).then_some(24))
            }),
            Some(new),
        );
    }
}
