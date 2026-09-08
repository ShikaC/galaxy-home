import { useMutation, useQueryClient } from "@tanstack/react-query"
import { endOfWeek, format, startOfWeek } from "date-fns"
import { Bot, CalendarDays, Check, Lightbulb } from "lucide-react"
import { useMemo, useState } from "react"
import type { ReviewSuggestion } from "../../shared/app.js"
import {
  gainSchema,
  reviewSuggestionConversionSchema,
  weeklyReviewSchema,
} from "../../shared/app.js"
import { useAppTime } from "../components/AppContext.js"
import { GainRow } from "../components/GainRow.js"
import { PageHeader, SectionHeader } from "../components/PageHeader.js"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { Badge } from "../components/ui/Status.js"
import { apiRequest, jsonBody } from "../lib/api.js"
import { queryKeys, useGains, useMeta, useReviews } from "../lib/queries.js"

export function ReviewPage() {
  const { today } = useAppTime()
  const gains = useGains()
  const reviews = useReviews()
  const meta = useMeta()
  const client = useQueryClient()
  const [date, setDate] = useState("")
  const [search, setSearch] = useState("")
  const [reflection, setReflection] = useState("")
  const record = useMutation({
    mutationFn: (content: string) =>
      apiRequest("/api/gains", gainSchema, {
        method: "POST",
        body: jsonBody({ localDate: today, content }),
      }),
    onSuccess: () => {
      setReflection("")
      setDate("")
      setSearch("")
      void client.invalidateQueries({ queryKey: queryKeys.gains })
    },
  })
  const now = new Date(`${today}T12:00:00.000Z`)
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd")
  const generate = useMutation({
    mutationFn: () =>
      apiRequest("/api/reviews/generate", weeklyReviewSchema, {
        method: "POST",
        body: jsonBody({ weekStart, weekEnd }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.reviews }),
  })
  const generateAi = useMutation({
    mutationFn: (confirmed: boolean) =>
      apiRequest("/api/reviews/generate-ai", weeklyReviewSchema, {
        method: "POST",
        body: jsonBody({ weekStart, weekEnd, confirmed }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.reviews })
      void client.invalidateQueries({ queryKey: ["ai-actions"] })
    },
  })
  const convert = useMutation({
    mutationFn: ({
      reviewId,
      suggestion,
    }: {
      readonly reviewId: string
      readonly suggestion: ReviewSuggestion
    }) =>
      apiRequest(
        `/api/reviews/${reviewId}/suggestions/${suggestion.id}/convert`,
        reviewSuggestionConversionSchema,
        { method: "POST" },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.reviews })
      void client.invalidateQueries({ queryKey: ["items"] })
      void client.invalidateQueries({ queryKey: ["habits"] })
      void client.invalidateQueries({ queryKey: queryKeys.projects })
    },
  })
  const filteredGains = useMemo(
    () =>
      gains.data?.filter(
        (gain) =>
          (date === "" || gain.localDate === date) &&
          gain.content.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [date, gains.data, search],
  )
  return (
    <div className="page">
      <PageHeader
        actions={
          <div className="button-row">
            <Button
              loading={generate.isPending}
              onClick={() => generate.mutate()}
              variant="secondary"
            >
              <Lightbulb size={16} />
              本地生成
            </Button>
            <Button
              disabled={!meta.data?.ai.configured}
              loading={generateAi.isPending}
              onClick={() => {
                const conservative = meta.data?.settings.aiPermission !== "open"
                if (!conservative || window.confirm("允许 AI 读取本周相关记录并生成回顾？"))
                  generateAi.mutate(conservative)
              }}
            >
              <Bot size={16} />
              AI 生成
            </Button>
          </div>
        }
        subtitle={
          <>
            原始收获只由你修改；周回顾会从真实记录中总结，
            <span className="page-header__clause">不替你改写原文。</span>
          </>
        }
        title="回顾"
      />
      {generate.isError || generateAi.isError ? (
        <p className="inline-error">{generate.error?.message ?? generateAi.error?.message}</p>
      ) : null}
      <div className="review-grid">
        <section className="section-band">
          <SectionHeader title="每日收获" />
          <form
            className="reflection-compose"
            onSubmit={(event) => {
              event.preventDefault()
              if (reflection.trim() && !record.isPending) record.mutate(reflection.trim())
            }}
          >
            <label htmlFor="daily-reflection">今天，有什么值得留下？</label>
            <textarea
              className="field__control field__control--area"
              disabled={record.isPending}
              id="daily-reflection"
              maxLength={5000}
              onChange={(event) => setReflection(event.target.value)}
              placeholder="一个新的发现，一点小小的进步，或是想对明天的自己说的话。"
              rows={3}
              value={reflection}
            />
            <div className="button-row">
              <Button disabled={!reflection.trim()} loading={record.isPending} type="submit">
                记录今日收获
              </Button>
              {record.isSuccess && reflection === "" ? (
                <span role="status">已记录，留给未来的自己。</span>
              ) : null}
            </div>
            {record.isError ? <p className="inline-error">{record.error.message}</p> : null}
          </form>
          <div className="review-filters">
            <label>
              <span>按日期</span>
              <input
                max={today}
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            <label>
              <span>搜索原文</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="输入关键词"
                value={search}
              />
            </label>
          </div>
          {filteredGains.length === 0 ? (
            <EmptyState
              description="记录会在这里汇聚，成为每周回顾的素材。"
              icon={CalendarDays}
              title="没有匹配记录"
            />
          ) : (
            <div className="gain-review-list">
              {filteredGains.map((gain) => (
                <GainRow gain={gain} key={gain.id} />
              ))}
            </div>
          )}
        </section>
        <section className="weekly-column">
          <SectionHeader
            action={
              <span>
                {weekStart} 至 {weekEnd}
              </span>
            }
            title="每周回顾"
          />
          {reviews.data?.length === 0 ? (
            <EmptyState
              action={
                <Button
                  loading={generate.isPending}
                  onClick={() => generate.mutate()}
                  size="compact"
                >
                  生成本周回顾
                </Button>
              }
              description="即使 AI 未配置，也会先用本地数据生成可用的周总结。"
              icon={Lightbulb}
              title="还没有周回顾"
            />
          ) : (
            reviews.data?.map((review) => (
              <article className="review-card" key={review.id}>
                <header>
                  <h3>{review.weekStart} 起</h3>
                  <Badge tone={review.source === "ai" ? "positive" : "neutral"}>
                    {review.source === "ai" ? "AI 生成" : "本地生成"}
                  </Badge>
                </header>
                <p>{review.summary}</p>
                {review.completed.length > 0 ? (
                  <div>
                    <strong>完成与收获</strong>
                    <ul>
                      {review.completed.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {review.obstacles.length > 0 ? (
                  <div>
                    <strong>可能的阻碍</strong>
                    <ul>
                      {review.obstacles.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="suggestions">
                  <strong>下周建议</strong>
                  {review.suggestions.map((suggestion) => (
                    <div key={suggestion.id}>
                      <p>{suggestion.content}</p>
                      <Button
                        disabled={
                          suggestion.convertedEntityId !== null ||
                          (convert.isPending && convert.variables?.suggestion.id === suggestion.id)
                        }
                        onClick={() => convert.mutate({ reviewId: review.id, suggestion })}
                        size="compact"
                        variant="secondary"
                      >
                        <Check size={15} />
                        {suggestion.convertedEntityId !== null
                          ? "已转换"
                          : `确认转为${suggestion.type === "item" ? "待办" : suggestion.type === "habit" ? "习惯" : "项目"}`}
                      </Button>
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
