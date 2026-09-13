import type { CalendarSnapshot } from "../../../shared/calendar.js"

export function CalendarCapacity({ snapshot }: { readonly snapshot: CalendarSnapshot }) {
  const format = (instant: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: snapshot.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(instant))
  const minutes = snapshot.freeSlots.reduce((total, slot) => total + slot.minutes, 0)
  return (
    <section className="calendar-capacity" aria-label="容量与冲突">
      <details>
        <summary>
          剩余空闲 {minutes} 分钟 · {snapshot.freeSlots.length} 个时段
        </summary>
        <ul>
          {snapshot.freeSlots.map((slot) => (
            <li key={slot.startAt}>
              {slot.localDate} {format(slot.startAt)}–{format(slot.endAt)} · {slot.minutes} 分钟
            </li>
          ))}
        </ul>
        {minutes === 0 ? <p>当前工作时段已没有空闲容量。请调整范围或工作时间。</p> : null}
      </details>
      {snapshot.conflicts.length === 0 ? (
        <p>当前安排没有检测到冲突。</p>
      ) : (
        <details open>
          <summary>待处理冲突 {snapshot.conflicts.length}</summary>
          <ul>
            {snapshot.conflicts.map((conflict) => (
              <li
                key={`${conflict.code}-${conflict.itemId}-${conflict.relatedItemId}-${conflict.localDate}`}
              >
                <strong>{conflict.severity === "blocker" ? "需处理" : "请留意"}</strong>{" "}
                {conflict.localDate ?? ""}{" "}
                {snapshot.items.find((item) => item.id === conflict.itemId)?.title ?? ""}：
                {conflict.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
