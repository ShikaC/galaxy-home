import { describe, expect, it } from "vitest"
import { ZodError } from "zod"
import { toErrorResponse } from "../../src/server/errorResponses.js"
import {
  ItemNotFoundError,
  ItemVersionConflictError,
} from "../../src/server/repositories/taskErrors.js"
import { AiServiceError } from "../../src/server/services/ai.js"
import { ImportArchiveInvalidError } from "../../src/server/services/backupArchive.js"
import { SeriesVersionConflictError } from "../../src/server/services/recurrence.js"
import { ERROR_CODES } from "../../src/shared/errorCodes.js"

// 这张表取代了 app.ts 里 87 行的 if-else 链，是错误码到 HTTP 语义的唯一映射。
// 挑几类形态各异的各锁一条，其余分支靠集成测试覆盖。
describe("错误到 HTTP 响应的映射", () => {
  it("固定错误码的分支带上 entityId", () => {
    const mapped = toErrorResponse(new ItemNotFoundError("item-1"))
    expect(mapped).toMatchObject({
      status: 404,
      body: {
        code: ERROR_CODES.ITEM_NOT_FOUND,
        entityId: "item-1",
        message: "Item not found: item-1",
      },
    })
  })

  it("同时带实体与版本号的冲突", () => {
    const mapped = toErrorResponse(new ItemVersionConflictError("item-2", 7))
    expect(mapped).toMatchObject({
      status: 409,
      body: { code: ERROR_CODES.ITEM_VERSION_CONFLICT, entityId: "item-2", currentVersion: 7 },
    })
  })

  it("沿用错误自带的 code 而不是在表里重写一遍", () => {
    const mapped = toErrorResponse(new SeriesVersionConflictError("series-1", 3))
    expect(mapped).toMatchObject({
      status: 409,
      body: { code: ERROR_CODES.SERIES_VERSION_CONFLICT, entityId: "series-1", currentVersion: 3 },
    })
  })

  it("AI 服务错误落 503 并要求记日志", () => {
    const mapped = toErrorResponse(new AiServiceError(ERROR_CODES.AI_AUTH, "认证失败"))
    expect(mapped).toMatchObject({
      status: 503,
      body: { code: ERROR_CODES.AI_AUTH, message: "认证失败" },
      log: "ai.request.failed",
    })
  })

  it("导入字段无效用固定文案，不泄漏内部表名", () => {
    const mapped = toErrorResponse(new ImportArchiveInvalidError("items", "secret_column"))
    expect(mapped).toMatchObject({
      status: 400,
      body: { code: ERROR_CODES.IMPORT_ARCHIVE_INVALID, message: "导入文件字段无效" },
    })
  })

  it("校验错误取第一条 issue 的说明", () => {
    const error = new ZodError([
      { code: "custom", message: "标题不能为空", path: ["title"] },
      { code: "custom", message: "第二条不该被选中", path: ["notes"] },
    ])
    expect(toErrorResponse(error)).toMatchObject({
      status: 400,
      body: { code: ERROR_CODES.VALIDATION_ERROR, message: "标题不能为空" },
    })
  })

  it("认不出来的错误返回 null，由调用方落 500——不要在这里兜底，否则没法记原始堆栈", () => {
    expect(toErrorResponse(new Error("boom"))).toBeNull()
    expect(toErrorResponse("not an error")).toBeNull()
  })
})
