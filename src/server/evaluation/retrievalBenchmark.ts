import { randomUUID } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import { migrateDatabase } from "../database.js"
import { retrieveSources } from "../services/planning/retrieval.js"

const corpus = [
  ["作品集", "作品集案例的结构与验证", "如何整理作品集案例"],
  ["面试", "面试时解释技术决策的练习", "面试项目介绍准备"],
  ["Agent", "Agent 工具调用评测用例", "Agent 工具失败检查"],
  ["阅读", "阅读章节后的复述方法", "阅读笔记复述"],
  ["文章", "文章问题方案结果的结构", "文章结构案例"],
  ["调研", "调研访谈的问题与记录", "调研访谈模板"],
  ["健身", "健身每周动作与休息安排", "健身动作休息"],
  ["旅行", "旅行路线和住宿清单", "旅行路线安排"],
  ["摄影", "摄影光线与构图练习", "摄影构图练习"],
  ["烹饪", "烹饪备菜与采购记录", "烹饪备菜"],
  ["预算", "预算分类与月度支出", "预算支出分类"],
  ["设计", "设计原型的可用性观察", "设计原型观察"],
  ["代码", "代码审查的错误和修复", "代码审查修复"],
  ["数据", "数据清理重复值与缺失项", "数据清理缺失项"],
  ["演讲", "演讲开场结构和练习", "演讲开场练习"],
  ["归档", "归档文件的命名方式", "归档命名"],
  ["英语", "英语口语发音练习记录", "英语发音练习"],
  ["日语", "日语语法和例句整理", "日语例句语法"],
  ["音乐", "音乐节奏与音阶练习", "音乐音阶练习"],
  ["数学", "数学概率与统计复习", "数学概率复习"],
  ["数据库", "数据库索引和查询计划", "数据库查询索引"],
  ["部署", "部署服务的健康检查", "部署健康检查"],
  ["无障碍", "无障碍键盘焦点检查", "无障碍键盘焦点"],
  ["睡眠", "睡眠记录和起床时间", "睡眠起床记录"],
  ["家务", "家务清洁与收纳清单", "家务收纳"],
  ["回顾", "回顾周记中的成果和阻碍", "复盘这一周的得失"],
  ["沟通", "沟通时倾听并复述对方意图", "交流时怎样确认理解"],
  ["运动", "运动前先拉伸活动关节", "锻炼之前的热身流程"],
  ["收集", "收集脑海中的零散想法", "捕捉灵感"],
  ["专注", "专注期间关闭提醒减少干扰", "进入心流如何免受打扰"],
] as const
export function retrievalBenchmark() {
  const database = new DatabaseSync(":memory:")
  try {
    migrateDatabase(database)
    const cases = corpus.map(([title, content, query], index) => {
      const id = randomUUID()
      database
        .prepare(
          "INSERT INTO workspace_notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(id, title, content, String(index).padStart(3, "0"), String(index).padStart(3, "0"))
      return { id, query, title }
    })
    const recentIds = database
      .prepare("SELECT id FROM workspace_notes ORDER BY updated_at DESC LIMIT 6")
      .all()
      .map((row) => row["id"])
    const results = cases.map(({ id, query, title }) => {
      const ranked = retrieveSources(database, query)
      return {
        query,
        expectedTitle: title,
        recentHit: recentIds.includes(id),
        rankedHit: ranked.some((note) => note.id === id),
        rank: ranked.findIndex((note) => note.id === id) + 1 || null,
      }
    })
    return {
      dataset: "synthetic-30-topics-v1",
      cases: results.length,
      k: 6,
      recentRecall: results.filter((result) => result.recentHit).length / results.length,
      rankedRecall: results.filter((result) => result.rankedHit).length / results.length,
      reciprocalRank:
        results.reduce((sum, result) => sum + (result.rank === null ? 0 : 1 / result.rank), 0) /
        results.length,
      results,
    }
  } finally {
    database.close()
  }
}
