import type { DatabaseSync } from "node:sqlite"
import type { Item } from "../../shared/items.js"
import type { Project } from "../../shared/projects.js"

export function replaceItemProjects(
  database: DatabaseSync,
  itemId: Item["id"],
  projectIds: readonly Project["id"][],
): void {
  database.exec("BEGIN IMMEDIATE")
  try {
    database.prepare("DELETE FROM item_projects WHERE item_id = ?").run(itemId)
    const statement = database.prepare(
      "INSERT INTO item_projects (item_id, project_id) VALUES (?, ?)",
    )
    for (const projectId of projectIds) statement.run(itemId, projectId)
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
