import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { SectionHeader } from "./PageHeader.js"

type TrendPoint = { readonly date: string; readonly 完成习惯: number }

export function HabitTrend({
  data,
  title,
}: {
  readonly data: TrendPoint[]
  readonly title: string
}) {
  return (
    <section className="chart-frame">
      <SectionHeader title={title} />
      <p className="sr-only">折线图展示每日完成的习惯条数。</p>
      <ResponsiveContainer height={220} width="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -24 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="date"
            interval="preserveStartEnd"
            tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              color: "var(--color-text)",
            }}
          />
          <Line
            dataKey="完成习惯"
            dot={false}
            stroke="var(--color-action)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
