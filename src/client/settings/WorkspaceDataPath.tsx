import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy, FolderTree } from "lucide-react"
import { useState } from "react"
import { Button } from "../components/ui/Button.js"
import { apiVoid } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

type CopyNotice = "copied" | "failed" | null

export function WorkspaceDataPath() {
  const meta = useMeta()
  const client = useQueryClient()
  const [copyNotice, setCopyNotice] = useState<CopyNotice>(null)
  const [cleared, setCleared] = useState(false)
  const paths = meta.data?.paths
  const exampleCount = meta.data?.tutorial.exampleCount ?? 0
  const clearExamples = useMutation({
    mutationFn: () => apiVoid("/api/tutorial/examples/clear", { method: "POST" }),
    onSuccess: () => {
      setCleared(true)
      void client.invalidateQueries({ queryKey: queryKeys.meta })
      void client.invalidateQueries({ queryKey: ["items"] })
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: ["trash"] })
    },
  })
  const copyPath = async () => {
    if (paths === undefined) return
    try {
      await navigator.clipboard.writeText(paths.dataDirectory)
      setCopyNotice("copied")
    } catch {
      const field = document.createElement("textarea")
      field.value = paths.dataDirectory
      field.setAttribute("readonly", "")
      field.style.position = "fixed"
      field.style.left = "-9999px"
      document.body.append(field)
      field.select()
      const copied = document.execCommand("copy")
      field.remove()
      setCopyNotice(copied ? "copied" : "failed")
    }
  }
  return (
    <div className="workspace-path">
      <div className="workspace-path__header">
        <FolderTree aria-hidden="true" size={18} />
        <div>
          <h3>数据目录</h3>
          <p className="workspace-path__lede">
            浏览器开发默认项目下的 <code>data/</code>
            ，桌面壳默认 Application Support。设环境变量 <code>GALAXY_DATA_DIR</code>{" "}
            可让两端共用同一份库。重启不会清空这里。
          </p>
        </div>
      </div>
      {paths === undefined ? (
        <p className="muted">正在读取路径…</p>
      ) : (
        <>
          <div className="workspace-path__row">
            <span>当前目录</span>
            <code title={paths.dataDirectory}>{paths.dataDirectory}</code>
            <Button
              onClick={() => void copyPath()}
              size="compact"
              type="button"
              variant="secondary"
            >
              <Copy size={15} />
              复制路径
            </Button>
          </div>
          <dl className="workspace-path__meta">
            <div>
              <dt>数据库</dt>
              <dd>
                <code>{paths.databaseFile}</code>
              </dd>
            </div>
            <div>
              <dt>备份</dt>
              <dd>
                <code>{paths.backupDirectory}</code>
              </dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{paths.source === "env" ? "GALAXY_DATA_DIR" : "当前进程默认目录"}</dd>
            </div>
          </dl>
          {copyNotice === "copied" ? <span className="success-text">已复制</span> : null}
          {copyNotice === "failed" ? (
            <p className="inline-error">复制失败，请手动选择路径。</p>
          ) : null}
        </>
      )}
      {exampleCount > 0 ? (
        <div className="workspace-path__examples">
          <p className="workspace-path__note">这个空间里还有 {exampleCount} 条未改过的教学示例。</p>
          <Button
            loading={clearExamples.isPending}
            onClick={() => {
              if (window.confirm("清除教学示例？它们会进入回收站，已编辑过的内容不会动。")) {
                clearExamples.mutate()
              }
            }}
            type="button"
            variant="secondary"
          >
            清除教学示例
          </Button>
          {cleared ? <span className="success-text">已移入回收站</span> : null}
          {clearExamples.isError ? (
            <p className="inline-error">{clearExamples.error.message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
