import { mkdirSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { z } from "zod"

const evidence = ".omo/evidence/workspace"

test.describe
  .serial("AI personal workspace", () => {
    test.beforeEach(async ({ page }) => {
      mkdirSync(evidence, { recursive: true })
      await page.goto("/")
      await expect(page.locator("h1").first()).toBeVisible()
      if (await page.getByRole("heading", { name: "布置你的工作空间", exact: true }).isVisible()) {
        await page.getByLabel("个人空间名称").fill("创作与探索")
        await page.getByLabel("AI 对你的称呼").fill("Shika")
        await page.getByRole("button", { name: "进入我的空间", exact: true }).click()
        await expect(page.getByRole("heading", { level: 1 })).toContainText("Shika")
      }
    })

    test("note editing survives new-note creation and provides save, search, archive and restore", async ({
      page,
    }) => {
      await page.goto("/notes")
      await page.getByRole("button", { name: "新建笔记", exact: true }).click()
      await page.getByLabel("笔记标题", { exact: true }).fill("  工作空间的下一章  ")
      await page
        .getByLabel("笔记正文", { exact: true })
        .fill(
          "# 设计思考\n\n让任务、知识和 AI 形成连贯的工作流。\n\n- 少一点切换\n- 多一点专注\n- 让有价值的思考留下来",
        )
      await page.getByRole("button", { name: "保存笔记", exact: true }).click()
      await expect(page.getByText("已保存到本地", { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(/让任务、知识和 AI/)
      const noteCount = await page.locator(".note-list-item").count()
      await page.getByLabel("笔记正文", { exact: true }).fill("尚未保存的珍贵想法")
      await page.getByRole("button", { name: "新建笔记", exact: true }).click()
      await expect(page.getByRole("dialog", { name: "未保存的笔记" })).toBeVisible()
      await page.getByRole("button", { name: "返回笔记", exact: true }).click()
      await expect(page.locator(".note-list-item")).toHaveCount(noteCount)
      await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue("尚未保存的珍贵想法")
      await page.getByRole("button", { name: "保存笔记", exact: true }).click()
      await expect(page.getByText("已保存到本地", { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "置顶笔记", exact: true }).click()
      await expect(page.getByRole("button", { name: "取消置顶笔记", exact: true })).toBeVisible()
      await page.screenshot({ path: `${evidence}/notes-editor.png` })
      const download = page.waitForEvent("download")
      await page.getByRole("button", { name: "导出 Markdown", exact: true }).click()
      expect((await download).suggestedFilename()).toBe("工作空间的下一章.md")
      await page.getByRole("button", { name: "归档笔记", exact: true }).click()
      await page.getByRole("button", { name: "已归档", exact: true }).click()
      await page.getByRole("button", { name: /工作空间的下一章/ }).click()
      await page.getByRole("button", { name: "恢复笔记", exact: true }).click()
      await page.getByRole("button", { name: "全部笔记", exact: true }).click()
      await page.getByRole("button", { name: /工作空间的下一章/ }).click()
      await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue("尚未保存的珍贵想法")
      await page
        .getByLabel("笔记正文", { exact: true })
        .fill(
          "# 设计思考\n\n让任务、知识和 AI 形成连贯的工作流。\n\n- 少一点切换\n- 多一点专注\n- 让有价值的思考留下来",
        )
      await page.getByRole("button", { name: "保存笔记", exact: true }).click()
      await expect(page.getByText("已保存到本地", { exact: true })).toBeVisible()
      await page.getByLabel("笔记正文", { exact: true }).fill("这段草稿将主动放弃")
      await page.getByRole("button", { name: "新建笔记", exact: true }).click()
      await page.getByRole("button", { name: "放弃修改并新建", exact: true }).click()
      await expect(page.getByLabel("笔记标题", { exact: true })).toHaveValue("未命名笔记")
      await expect(page.locator(".note-list-item")).toHaveCount(noteCount + 1)
      await page.getByRole("button", { name: /工作空间的下一章/ }).click()
      await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(/让任务、知识和 AI/)
    })

    test("focus countdown resumes after reload and supports an accessible expanded view", async ({
      page,
    }) => {
      await page.goto("/")
      await page.getByRole("button", { name: "开始专注", exact: true }).click()
      await expect(page.getByRole("button", { name: "暂停专注", exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByRole("button", { name: "暂停专注", exact: true })).toBeVisible()
      await page.getByRole("button", { name: "暂停专注", exact: true }).click()
      await page.getByRole("button", { name: "放大专注计时", exact: true }).click()
      await expect(page.getByRole("dialog", { name: "专注模式" })).toBeVisible()
      await page.screenshot({ path: `${evidence}/focus-expanded.png` })
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog", { name: "专注模式" })).toBeHidden()
      await page.getByRole("button", { name: "重置专注计时", exact: true }).click()
      await expect(page.getByRole("timer")).toHaveText("25:00")
    })

    test("task capture, today's list, completion and AI handoff are real", async ({
      page,
      request,
    }) => {
      await page.goto("/")
      await page.getByRole("button", { name: /^随手记/ }).click()
      await page.getByLabel("标题", { exact: true }).fill("完成新的作品集首页")
      await page.getByRole("button", { name: "保存到收集箱" }).click()
      await page.getByRole("button", { name: /^收集箱/ }).click()
      await expect(page.getByText("完成新的作品集首页", { exact: true })).toBeVisible()
      const items = z
        .array(z.object({ id: z.string(), title: z.string() }))
        .parse(await (await request.get("/api/items?view=inbox&localDate=2026-09-08")).json())
      const item = items.find((entry) => entry.title === "完成新的作品集首页")
      if (!item) throw new Error("Captured item missing")
      const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
        new Date(),
      )
      const todayResponse = await request.put(`/api/items/${item.id}/today`, {
        data: { localDate, isFocus: true, isSecondary: false },
      })
      expect(todayResponse.ok()).toBe(true)
      await page.reload()
      await page.getByRole("button", { name: "完成 完成新的作品集首页", exact: true }).click()
      await page.getByRole("button", { name: /^已完成/ }).click()
      await expect(page.getByText("完成新的作品集首页", { exact: true })).toBeVisible()
      await page.getByRole("button", { name: "规划今天", exact: true }).click()
      await expect(page.getByLabel("给 AI 发送消息")).toHaveValue(/请结合整个工作空间/)
      await expect(page.getByText("AI 尚未配置", { exact: true })).toBeVisible()
      await page.screenshot({ path: `${evidence}/ai-unconfigured.png` })
      await page.getByRole("button", { name: "收起 星伴", exact: true }).click()
      await page.getByRole("link", { name: "连接 AI 服务", exact: true }).click()
      await expect(page.getByRole("heading", { name: "AI 服务与权限", exact: true })).toBeVisible()
    })

    test("daily reflection persists and feeds the weekly review", async ({ page }) => {
      await page.goto("/review")
      await page
        .getByLabel("今天，有什么值得留下？")
        .fill("把灵感变成作品，从一个可完成的小步骤开始。")
      await page.getByRole("button", { name: "记录今日收获", exact: true }).click()
      await expect(page.getByRole("status").filter({ hasText: "已记录" })).toBeVisible()
      await page.reload()
      await expect(page.locator(".gain-row")).toContainText("把灵感变成作品")
      await page.getByRole("button", { name: "本地生成", exact: true }).click()
      await expect(page.locator(".review-card").first()).toBeVisible()
    })

    test("all workspace routes render at desktop, tablet and phone widths", async ({
      page,
      request,
    }) => {
      test.setTimeout(90_000)
      const projectResponse = await request.post("/api/projects", {
        data: {
          name: "个人作品集 2026",
          desiredOutcome: "用作品表达自己的思考，完成一次有意义的创作。",
        },
      })
      expect(projectResponse.ok()).toBe(true)
      const project = z.object({ id: z.string().uuid() }).parse(await projectResponse.json())
      for (const [name, path] of [
        ["home", "/"],
        ["tasks", "/todos"],
        ["projects", "/projects"],
        ["project", `/projects/${project.id}`],
        ["notes", "/notes"],
        ["habits", "/habits"],
        ["review", "/review"],
        ["settings", "/settings"],
        ["primitives", "/design-system"],
      ]) {
        if (!name || !path) throw new Error("Missing QA route")
        for (const width of [1440, 768, 375]) {
          await page.setViewportSize({ width, height: 960 })
          await page.goto(path)
          await expect(page.locator("h1").first()).toBeVisible()
          await page.screenshot({ path: `${evidence}/${name}-${width}.png` })
          const overflow = await page.evaluate(() => {
            const main = document.querySelector(".main-scroll")
            return {
              body: document.documentElement.scrollWidth > innerWidth + 1,
              main: main ? main.scrollWidth > main.clientWidth + 1 : false,
            }
          })
          expect(overflow, `${path} at ${width}px`).toEqual({ body: false, main: false })
          await expect(page.getByText("页面暂时无法打开", { exact: true })).toHaveCount(0)
        }
      }
    })
  })
