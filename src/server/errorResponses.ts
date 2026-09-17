// 错误类型 → HTTP 响应的映射。原本这段是 app.ts 里一条 87 行的 if-else 链，
// 新增错误类型要插进链条中间。
//
// 改成规则表之后有两处实际收益：
//   1. 新增错误只要追加一条，不用判断该插在哪；
//   2. 顺序不再决定正确性。链式写法里如果某个错误类继承了另一个，谁排在
//      前面会静默改变行为，而这一点从链上根本看不出来——目前恰好没有这种
//      继承关系（AiInvalidEndpointError 并不继承 AiServiceError），但那是
//      巧合而非保证。
//
// 每条规则内部用 instanceof 收窄一次，类型安全与原来的 if 链一致。
import { ZodError } from "zod"
import { ERROR_CODES, type ErrorCode } from "../shared/errorCodes.js"
import { RecurrenceLocalTimeError } from "../shared/recurrence.js"
import { AiActionUnavailableError } from "./repositories/aiActions.js"
import { HabitRestDayError } from "./repositories/habitLogs.js"
import { ProjectAiPlanStaleError, ProjectAiSessionNotFoundError } from "./repositories/projectAi.js"
import { ProjectTaskNotRecommendedError } from "./repositories/projectRecommendations.js"
import { ReviewSuggestionUnavailableError } from "./repositories/reviewSuggestions.js"
import {
  ItemCreateRequestConflictError,
  ItemHasOpenSubtasksError,
  ItemNotFoundError,
  ItemParentConflictError,
  ItemVersionConflictError,
} from "./repositories/taskErrors.js"
import { TaskSeriesNotFoundError } from "./repositories/taskSeries.js"
import { AiServiceError } from "./services/ai.js"
import { AiInvalidEndpointError } from "./services/aiEndpoint.js"
import { AiConfirmationRequiredError } from "./services/aiReview.js"
import {
  ImportArchiveInvalidError,
  ImportArchiveMalformedError,
  ImportArchiveTooLargeError,
} from "./services/backup.js"
import {
  OccurrenceRequiredError,
  ItemVersionConflictError as RecurrenceItemVersionConflictError,
  RecurrenceRequestConflictError,
  SeriesVersionConflictError,
  TaskSeriesRelationNotFoundError,
} from "./services/recurrence.js"
import { TaskPlanError } from "./services/taskPlanning/store.js"

export type ErrorResponse = {
  readonly status: number
  // 每条规则都带 code 与 message，其余字段（entityId、currentVersion）按需追加。
  readonly body: {
    readonly code: ErrorCode
    readonly message: string
    readonly [extra: string]: unknown
  }
  /** 需要记日志的类别（目前只有 AI 服务错误）。 */
  readonly log?: string
}

type ErrorRule = (error: unknown) => ErrorResponse | null

const rules: readonly ErrorRule[] = [
  (error) =>
    error instanceof ZodError
      ? {
          status: 400,
          body: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: error.issues[0]?.message ?? "输入内容无效",
          },
        }
      : null,
  (error) =>
    error instanceof ItemVersionConflictError
      ? {
          status: 409,
          body: {
            code: ERROR_CODES.ITEM_VERSION_CONFLICT,
            entityId: error.itemId,
            currentVersion: error.currentVersion,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof ItemCreateRequestConflictError
      ? {
          status: 409,
          body: {
            code: ERROR_CODES.ITEM_CREATE_REQUEST_CONFLICT,
            entityId: error.requestId,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof ItemParentConflictError
      ? {
          status: 409,
          body: {
            code: ERROR_CODES.ITEM_PARENT_CONFLICT,
            entityId: error.itemId,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof ItemHasOpenSubtasksError
      ? {
          status: 409,
          body: {
            code: ERROR_CODES.ITEM_HAS_OPEN_SUBTASKS,
            entityId: error.itemId,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof ItemNotFoundError
      ? {
          status: 404,
          body: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            entityId: error.itemId,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof SeriesVersionConflictError
      ? {
          status: 409,
          body: {
            code: error.code,
            entityId: error.entityId,
            currentVersion: error.currentVersion,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof RecurrenceRequestConflictError
      ? {
          status: 409,
          body: { code: error.code, entityId: error.entityId, message: error.message },
        }
      : null,
  (error) =>
    error instanceof TaskSeriesRelationNotFoundError
      ? {
          status: 409,
          body: { code: error.code, entityId: error.entityId, message: error.message },
        }
      : null,
  (error) =>
    error instanceof RecurrenceItemVersionConflictError
      ? {
          status: 409,
          body: {
            code: error.code,
            entityId: error.entityId,
            currentVersion: error.currentVersion,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof OccurrenceRequiredError
      ? {
          status: 409,
          body: { code: error.code, entityId: error.itemId, message: error.message },
        }
      : null,
  (error) =>
    error instanceof TaskSeriesNotFoundError
      ? {
          status: 404,
          body: {
            code: ERROR_CODES.TASK_SERIES_NOT_FOUND,
            entityId: error.seriesId,
            message: error.message,
          },
        }
      : null,
  (error) =>
    error instanceof RecurrenceLocalTimeError
      ? {
          status: 400,
          body: { code: ERROR_CODES.RECURRENCE_LOCAL_TIME_INVALID, message: error.message },
        }
      : null,
  (error) =>
    error instanceof TaskPlanError
      ? { status: error.statusCode, body: { code: error.code, message: error.message } }
      : null,
  (error) =>
    error instanceof HabitRestDayError
      ? { status: 409, body: { code: ERROR_CODES.HABIT_REST_DAY, message: error.message } }
      : null,
  (error) =>
    error instanceof ProjectAiPlanStaleError
      ? { status: 409, body: { code: ERROR_CODES.PROJECT_AI_STALE, message: error.message } }
      : null,
  (error) =>
    error instanceof ProjectAiSessionNotFoundError
      ? {
          status: 409,
          body: { code: ERROR_CODES.PROJECT_AI_SESSION_MISSING, message: error.message },
        }
      : null,
  (error) =>
    error instanceof ProjectTaskNotRecommendedError
      ? {
          status: 409,
          body: { code: ERROR_CODES.PROJECT_TASK_NOT_RECOMMENDED, message: error.message },
        }
      : null,
  (error) =>
    error instanceof ReviewSuggestionUnavailableError
      ? {
          status: 409,
          body: { code: ERROR_CODES.REVIEW_SUGGESTION_UNAVAILABLE, message: error.message },
        }
      : null,
  (error) =>
    error instanceof AiConfirmationRequiredError
      ? {
          status: 409,
          body: { code: ERROR_CODES.AI_CONFIRMATION_REQUIRED, message: error.message },
        }
      : null,
  (error) =>
    error instanceof AiActionUnavailableError
      ? {
          status: 409,
          body: { code: ERROR_CODES.AI_ACTION_UNAVAILABLE, message: error.message },
        }
      : null,
  (error) =>
    error instanceof ImportArchiveTooLargeError
      ? {
          status: 413,
          body: { code: ERROR_CODES.IMPORT_ARCHIVE_TOO_LARGE, message: error.message },
        }
      : null,
  (error) =>
    error instanceof ImportArchiveMalformedError
      ? {
          status: 400,
          body: { code: ERROR_CODES.IMPORT_ARCHIVE_INVALID, message: error.message },
        }
      : null,
  (error) =>
    error instanceof ImportArchiveInvalidError
      ? {
          status: 400,
          body: { code: ERROR_CODES.IMPORT_ARCHIVE_INVALID, message: "导入文件字段无效" },
        }
      : null,
  (error) =>
    error instanceof AiInvalidEndpointError
      ? { status: 400, body: { code: error.code, message: error.message } }
      : null,
  (error) =>
    error instanceof AiServiceError
      ? {
          status: 503,
          body: { code: error.code, message: error.message },
          log: "ai.request.failed",
        }
      : null,
]

/** 命中规则就返回响应，都不命中返回 null（由调用方落 500）。 */
export function toErrorResponse(error: unknown): ErrorResponse | null {
  for (const rule of rules) {
    const response = rule(error)
    if (response !== null) return response
  }
  return null
}
