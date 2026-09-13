import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { withImmediateTransaction } from "../../src/server/repositories/transaction.js"

describe("repository transaction helper", () => {
  it("joins an outer transaction so the caller controls rollback", () => {
    // Given
    const database = new DatabaseSync(":memory:")
    database.exec("CREATE TABLE values_table (value TEXT); BEGIN IMMEDIATE")

    // When
    withImmediateTransaction(database, () => {
      database.prepare("INSERT INTO values_table (value) VALUES ('inside')").run()
    })
    database.exec("ROLLBACK")

    // Then
    expect(database.prepare("SELECT value FROM values_table").all()).toEqual([])
    database.close()
  })
})
