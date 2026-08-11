use std::path::{Path, PathBuf};

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

fn first_existing_candidate(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
  candidates.into_iter().find(|path| path.is_file())
}

pub(crate) fn find_node_binary() -> Result<PathBuf, String> {
  first_existing_candidate(candidates())
    .ok_or_else(|| {
      "无法定位 Node.js（需本机 Node ≥24）；请设置 GALAXY_NODE_PATH 或将 Node 加入桌面端可见的 PATH".into()
    })
}

#[cfg(test)]
mod tests {
  use super::first_existing_candidate;
  use std::path::PathBuf;

  #[test]
  fn selects_the_first_existing_binary_candidate() {
    let existing = std::env::current_exe().expect("current test executable");
    let missing = existing.with_file_name("missing-node-binary");

    assert_eq!(
      first_existing_candidate([missing, existing.clone()]),
      Some(existing)
    );
    assert_eq!(
      first_existing_candidate([PathBuf::from("missing-node-a")]),
      None
    );
  }
}
