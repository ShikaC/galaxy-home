import type { ReactNode } from "react"

type HomeSkyMetrics = {
  readonly habitsDone: number
  readonly habitsTotal: number
  readonly harvestCount: number
  readonly tasksDone: number
  readonly tasksTotal: number
}

export function HomeSky({
  actions,
  dateText,
  greeting,
  metrics,
  subtitle,
}: {
  readonly actions: ReactNode
  readonly dateText: string
  readonly greeting: string
  readonly metrics: HomeSkyMetrics
  readonly subtitle: string
}) {
  return (
    <header className="home-sky">
      <div className="home-sky__copy">
        <p className="eyebrow">{dateText}</p>
        <h1>今日空间</h1>
        <p>
          {greeting}。{subtitle}
        </p>
      </div>
      <div className="home-sky__aside">
        <dl className="home-metrics">
          <div>
            <dt>待办</dt>
            <dd>
              {metrics.tasksDone}
              <span>/{metrics.tasksTotal}</span>
            </dd>
          </div>
          <div>
            <dt>习惯</dt>
            <dd>
              {metrics.habitsDone}
              <span>/{metrics.habitsTotal}</span>
            </dd>
          </div>
          <div>
            <dt>收获</dt>
            <dd>{metrics.harvestCount}</dd>
          </div>
        </dl>
        {actions}
      </div>
    </header>
  )
}
