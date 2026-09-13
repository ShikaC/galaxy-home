export class ItemNotFoundError extends Error {
  readonly name = "ItemNotFoundError"
  constructor(readonly itemId: string) {
    super(`Item not found: ${itemId}`)
  }
}

export class ItemVersionConflictError extends Error {
  readonly name = "ItemVersionConflictError"
  constructor(
    readonly itemId: string,
    readonly currentVersion: number,
  ) {
    super(`Task ${itemId} changed at version ${currentVersion}`)
  }
}

export class ItemParentConflictError extends Error {
  readonly name = "ItemParentConflictError"
  constructor(
    readonly itemId: string,
    readonly reason: string,
  ) {
    super(reason)
  }
}

export class ItemHasOpenSubtasksError extends Error {
  readonly name = "ItemHasOpenSubtasksError"
  constructor(readonly itemId: string) {
    super("请先完成所有未完成的子任务")
  }
}

export class ItemCreateRequestConflictError extends Error {
  readonly name = "ItemCreateRequestConflictError"
  constructor(readonly requestId: string) {
    super("同一创建请求不能用于不同内容")
  }
}
