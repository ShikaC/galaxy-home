import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, RotateCcw, Trash2, Upload } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { workspaceSettingsSchema } from "../../shared/settings.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { TextField } from "../components/ui/Field.js"
import { IconButton } from "../components/ui/IconButton.js"
import { apiRequest, apiVoid, jsonBody } from "../lib/api.js"
import { queryKeys, useMeta } from "../lib/queries.js"

const trashSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      entity_type: z.string(),
      entity_id: z.string(),
      display_name: z.string(),
      deleted_at: z.string(),
      purge_after: z.string(),
    }),
  )
  .readonly()

export function DataSettings() {
  const meta = useMeta()
  const client = useQueryClient()
  const [backupRetentionDays, setBackupRetentionDays] = useState("30")
  const [trashRetentionDays, setTrashRetentionDays] = useState("30")
  useEffect(() => {
    if (meta.data !== undefined) {
      setBackupRetentionDays(String(meta.data.settings.backupRetentionDays))
      setTrashRetentionDays(String(meta.data.settings.trashRetentionDays))
    }
  }, [meta.data])
  const trash = useQuery({
    queryKey: ["trash"],
    queryFn: () => apiRequest("/api/trash", trashSchema),
  })
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["trash"] })
    void client.invalidateQueries({ queryKey: ["items"] })
    void client.invalidateQueries({ queryKey: queryKeys.meta })
  }
  const restoreTrash = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/trash/${id}/restore`, { method: "POST" }),
    onSuccess: refresh,
  })
  const purge = useMutation({
    mutationFn: (id: string) => apiVoid(`/api/trash/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  })
  const restoreFile = useMutation({
    mutationFn: (file: File) =>
      file.arrayBuffer().then((body) =>
        apiVoid("/api/restore", {
          method: "POST",
          headers: { "Content-Type": "application/zip" },
          body,
        }),
      ),
    onSuccess: () => window.location.reload(),
  })
  const saveRetention = useMutation({
    mutationFn: () =>
      apiRequest("/api/settings", workspaceSettingsSchema, {
        method: "PATCH",
        body: jsonBody({
          backupRetentionDays: Number(backupRetentionDays),
          trashRetentionDays: Number(trashRetentionDays),
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.meta }),
  })
  const size =
    meta.data === undefined
      ? "0 KB"
      : `${Math.max(0.1, meta.data.backup.sizeBytes / 1024).toFixed(1)} KB`
  return (
    <section className="settings-section">
      <header>
        <h2>本地数据</h2>
        <p>自动快照默认保留 30 天；恢复前会先创建恢复点。</p>
      </header>
      <div className="backup-status">
        <div>
          <span>最近自动备份</span>
          <strong>
            {meta.data?.backup.latestAt
              ? new Date(meta.data.backup.latestAt).toLocaleString("zh-CN")
              : "尚未创建"}
          </strong>
        </div>
        <div>
          <span>占用空间</span>
          <strong>{size}</strong>
        </div>
        <a className="button button--secondary button--regular" download href="/api/export">
          <Download size={16} />
          手动导出 ZIP
        </a>
        <label className="button button--secondary button--regular">
          <Upload size={16} />
          恢复数据
          <input
            accept=".zip,application/zip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.item(0)
              if (file && window.confirm("恢复会替换当前业务数据，确定继续吗？"))
                restoreFile.mutate(file)
            }}
            type="file"
          />
        </label>
      </div>
      <form
        className="form-stack settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          saveRetention.mutate()
        }}
      >
        <div className="form-grid">
          <TextField
            label="自动备份保留天数"
            max={365}
            min={7}
            onChange={(event) => setBackupRetentionDays(event.target.value)}
            type="number"
            value={backupRetentionDays}
          />
          <TextField
            label="回收站保留天数"
            max={365}
            min={1}
            onChange={(event) => setTrashRetentionDays(event.target.value)}
            type="number"
            value={trashRetentionDays}
          />
        </div>
        <div>
          <Button loading={saveRetention.isPending} type="submit">
            保存保留规则
          </Button>
          {saveRetention.isSuccess ? <span className="success-text">已保存</span> : null}
        </div>
      </form>
      {restoreFile.isError || saveRetention.isError ? (
        <p className="inline-error">{restoreFile.error?.message ?? saveRetention.error?.message}</p>
      ) : null}
      <div className="subsection">
        <h3>回收站</h3>
        {trash.data?.length === 0 ? (
          <EmptyState description="删除的内容会先在这里保留。" icon={Trash2} title="回收站是空的" />
        ) : (
          <div className="trash-list">
            {trash.data?.map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>{entry.display_name}</strong>
                  <span>
                    {entry.entity_type} · {new Date(entry.deleted_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <IconButton label="恢复" onClick={() => restoreTrash.mutate(entry.id)}>
                  <RotateCcw size={16} />
                </IconButton>
                <IconButton
                  label="永久删除"
                  onClick={() => {
                    if (window.confirm(`永久删除“${entry.display_name}”？此操作无法撤销。`))
                      purge.mutate(entry.id)
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
