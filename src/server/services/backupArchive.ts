import { Unzip, UnzipInflate } from "fflate"

export const MAX_IMPORT_UNCOMPRESSED_BYTES = 32 * 1024 * 1024

export class ImportArchiveTooLargeError extends Error {
  readonly name = "ImportArchiveTooLargeError"

  constructor(readonly limitBytes: number) {
    super(`导入文件解压后超过 ${limitBytes} 字节上限`)
  }
}

export class ImportArchiveInvalidError extends Error {
  readonly name = "ImportArchiveInvalidError"

  constructor(
    readonly table: string,
    readonly column?: string,
  ) {
    super(
      column === undefined
        ? `导入表 ${table} 的行字段为空`
        : `导入表 ${table} 含未知字段 ${column}`,
    )
  }
}

export class ImportArchiveMalformedError extends Error {
  readonly name = "ImportArchiveMalformedError"

  constructor(cause: unknown) {
    super("恢复包格式错误或版本不兼容，现有数据未更改", { cause })
  }
}

export async function extractImportPayload(bytes: Uint8Array): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    let settled = false
    let seenTarget = false
    let totalBytes = 0
    const chunks: Uint8Array[] = []
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    const succeed = (payload: Uint8Array) => {
      if (settled) return
      settled = true
      resolve(payload)
    }
    const unzip = new Unzip()
    unzip.register(UnzipInflate)
    unzip.onfile = (file) => {
      if (file.name !== "galaxy-home.json") return
      if (seenTarget) {
        fail(new Error("导入文件包含重复的 galaxy-home.json"))
        return
      }
      seenTarget = true
      if (file.originalSize !== undefined && file.originalSize > MAX_IMPORT_UNCOMPRESSED_BYTES) {
        fail(new ImportArchiveTooLargeError(MAX_IMPORT_UNCOMPRESSED_BYTES))
        return
      }
      file.ondata = (error, data, final) => {
        if (error !== null) {
          fail(error)
          return
        }
        totalBytes += data.byteLength
        if (totalBytes > MAX_IMPORT_UNCOMPRESSED_BYTES) {
          fail(new ImportArchiveTooLargeError(MAX_IMPORT_UNCOMPRESSED_BYTES))
          return
        }
        chunks.push(data)
        if (!final) return
        if (chunks.length === 1) {
          const only = chunks[0]
          if (only !== undefined) {
            succeed(only)
            return
          }
        }
        const merged = new Uint8Array(totalBytes)
        let offset = 0
        for (const chunk of chunks) {
          merged.set(chunk, offset)
          offset += chunk.byteLength
        }
        succeed(merged)
      }
      file.start()
    }
    try {
      unzip.push(bytes, true)
    } catch (error) {
      fail(error instanceof Error ? error : new Error("导入文件无法解压"))
      return
    }
    if (!seenTarget) fail(new Error("导入文件缺少 galaxy-home.json"))
  })
}
