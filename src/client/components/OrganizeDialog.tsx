import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Repeat2, X } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { ERROR_CODES } from "../../shared/errorCodes.js"
import type { Item } from "../../shared/items.js"
import { itemSchema } from "../../shared/items.js"
import { ApiError, apiRequest, jsonBody } from "../lib/api.js"
import { invalidateTaskQueries } from "../lib/mutations.js"
import { useMeta, useProjects } from "../lib/queries.js"
import { itemsSchema } from "../lib/schemas.js"
import { useAppTime } from "./AppContext.js"
import { OrganizeScheduleFields } from "./OrganizeScheduleFields.js"
import { TaskOrganizationFields } from "./TaskOrganizationFields.js"
import { TaskSubtasks } from "./TaskSubtasks.js"
import { Button } from "./ui/Button.js"
import { TextField } from "./ui/Field.js"
import { IconButton } from "./ui/IconButton.js"
import { DialogSurface } from "./ui/ModalSurface.js"
import { strictInstantForLocalInput, useTaskEditorDraft } from "./useTaskEditorDraft.js"

type OrganizeDialogProps = {
  readonly item: Item | null
  readonly mode?: "organize" | "edit"
  readonly onClose: () => void
  readonly onEditSeries?: ((seriesId: string) => void) | undefined
  readonly onSaved?: (item: Item, detail: { readonly leftInbox: boolean }) => void
}

function TaskEditorDialog({
  item,
  mode,
  onClose,
  onEditSeries,
  onSaved,
}: Omit<OrganizeDialogProps, "item"> & { readonly item: Item }) {
  const meta = useMeta()
  const projects = useProjects()
  const client = useQueryClient()
  const { timezone, today } = useAppTime()
  const editor = useTaskEditorDraft(item, timezone)
  const { draft } = editor
  const [suggestNote, setSuggestNote] = useState<string | null>(null)
  const activeItems = useQuery({
    queryKey: ["items", "active", "parent-options"],
    queryFn: () => apiRequest(`/api/items?view=active&localDate=${today}`, itemsSchema),
  })
  const suggest = useMutation({
    mutationFn: () =>
      apiRequest(
        "/api/ai/suggest-categories",
        z.object({
          categoryIds: z.array(z.string().uuid()),
          suggestToday: z.boolean(),
          note: z.string().nullable(),
        }),
        { method: "POST", body: jsonBody({ itemId: item.id }) },
      ),
    onSuccess: (data) => {
      if (data.categoryIds.length > 0) editor.update({ categoryIds: data.categoryIds })
      setSuggestNote(
        data.note ??
          (data.suggestToday
            ? "已填入建议分类。AI 还建议加入今日；请保存后在任务菜单中操作。"
            : "已填入建议分类，保存后生效。"),
      )
    },
    onError: (error) =>
      setSuggestNote(error instanceof Error ? error.message : "建议失败，当前输入保持不变。"),
  })
  const save = useMutation({
    mutationFn: () => {
      const dueAt = strictInstantForLocalInput(draft.dueAt, timezone)
      const scheduledStartAt = strictInstantForLocalInput(draft.scheduledStartAt, timezone)
      const scheduledEndAt = strictInstantForLocalInput(draft.scheduledEndAt, timezone)
      if ((scheduledStartAt === null) !== (scheduledEndAt === null)) {
        throw new RangeError("安排开始和结束需要同时填写。")
      }
      if (
        scheduledStartAt !== null &&
        scheduledEndAt !== null &&
        scheduledEndAt <= scheduledStartAt
      ) {
        throw new RangeError("安排结束必须晚于开始。")
      }
      return apiRequest(`/api/items/${item.id}`, itemSchema, {
        method: "PATCH",
        body: jsonBody({
          expectedVersion: editor.expectedVersion,
          title: draft.title,
          notes: draft.notes || null,
          priority: draft.priority,
          parentId: draft.parentId || null,
          dueDate: draft.dueDate || null,
          dueAt,
          estimatedMinutes: draft.estimatedMinutes === "" ? null : Number(draft.estimatedMinutes),
          scheduledStartAt,
          scheduledEndAt,
          scheduleTimezone: scheduledStartAt === null ? null : timezone,
          isFixed: scheduledStartAt === null ? false : draft.isFixed,
          reminders: draft.reminders,
          categoryIds: draft.categoryIds,
          projectIds: draft.projectIds,
        }),
      })
    },
    onSuccess: async (savedItem) => {
      const wasInbox = item.categoryIds.length === 0 && item.projectIds.length === 0
      const leftInbox =
        wasInbox && (savedItem.categoryIds.length > 0 || savedItem.projectIds.length > 0)
      await invalidateTaskQueries(client)
      onSaved?.(savedItem, { leftInbox })
      onClose()
    },
  })
  const parentOptions = (activeItems.data ?? []).filter(
    (candidate) => candidate.id !== item.id && candidate.parentId === null,
  )
  return (
    <DialogSurface
      ariaLabelledBy="organize-title"
      className="dialog task-detail-dialog"
      onClose={onClose}
    >
      <header className="dialog__header">
        <div>
          <p className="eyebrow">{mode === "edit" ? "编辑待办" : "整理条目"}</p>
          <h2 id="organize-title">
            {mode === "edit" ? "把内容改成现在准确的样子" : "决定它接下来去哪里"}
          </h2>
        </div>
        <IconButton label={mode === "edit" ? "关闭编辑面板" : "关闭整理面板"} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <form
        className="form-stack"
        onKeyDown={(event) => {
          if ((event.nativeEvent.isComposing || event.keyCode === 229) && event.key === "Enter") {
            event.preventDefault()
          }
        }}
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <TextField
          label="标题"
          maxLength={240}
          onChange={(event) => editor.update({ title: event.target.value })}
          value={draft.title}
        />
        <TaskOrganizationFields
          aiConfigured={meta.data?.ai.configured ?? false}
          categories={meta.data?.categories ?? []}
          draft={draft}
          item={item}
          onChange={editor.update}
          onSuggest={() => suggest.mutate()}
          parentOptions={parentOptions}
          projects={projects.data ?? []}
          suggestNote={suggestNote}
          suggestPending={suggest.isPending}
        />
        <OrganizeScheduleFields draft={draft} onChange={editor.update} />
        {item.recurrenceSeriesId === null ? null : (
          <div className="series-origin">
            <Repeat2 size={15} />
            <span>这是 {item.recurrenceDate} 的重复实例；本页修改只影响本次。</span>
            {onEditSeries ? (
              <Button
                onClick={() => onEditSeries(item.recurrenceSeriesId ?? "")}
                size="compact"
                variant="secondary"
              >
                管理系列
              </Button>
            ) : null}
          </div>
        )}
        {item.parentId === null ? (
          <TaskSubtasks item={item} onParentVersionBump={editor.acknowledgeOwnVersionBump} />
        ) : null}
        {save.isError ? (
          <div className="conflict-feedback">
            <p className="inline-error" role="alert">
              {save.error.message} 本地输入仍保留，请重新载入对照后再试。
            </p>
            {save.error instanceof ApiError &&
            save.error.code === ERROR_CODES.ITEM_VERSION_CONFLICT ? (
              <Button
                onClick={() => {
                  void invalidateTaskQueries(client)
                  onClose()
                }}
                size="compact"
                variant="secondary"
              >
                重新载入任务
              </Button>
            ) : null}
          </div>
        ) : null}
        <footer className="dialog__actions">
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button disabled={!draft.title.trim()} loading={save.isPending} type="submit">
            {mode === "edit" ? "保存修改" : "保存整理"}
          </Button>
        </footer>
      </form>
    </DialogSurface>
  )
}

export function OrganizeDialog({ item, mode = "organize", ...props }: OrganizeDialogProps) {
  if (item === null) return null
  return <TaskEditorDialog {...props} item={item} key={item.id} mode={mode} />
}
