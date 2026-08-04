import { Bell, Inbox, Plus, Sparkles } from "lucide-react"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { TextArea, TextField } from "../components/ui/Field.js"
import { IconButton } from "../components/ui/IconButton.js"
import { Badge, ProgressBar } from "../components/ui/Status.js"

export function DesignShowcasePage() {
  return (
    <main className="showcase">
      <header className="showcase__header">
        <div className="brand-mark" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div>
          <p className="showcase__kicker">银河居所设计系统</p>
          <h1>安静，但每一步都清楚。</h1>
          <p>组件保持稳定尺寸、完整状态和自然中文换行。</p>
        </div>
      </header>

      <section className="showcase__section" aria-labelledby="buttons-title">
        <div className="showcase__section-heading">
          <h2 id="buttons-title">命令与状态</h2>
          <Badge tone="positive">基础原语</Badge>
        </div>
        <div className="showcase__row">
          <Button>
            <Plus aria-hidden="true" size={16} />
            新建条目
          </Button>
          <Button variant="secondary">稍后处理</Button>
          <Button variant="ghost">取消</Button>
          <Button variant="danger">移到回收站</Button>
          <Button loading>保存更改</Button>
          <Button disabled>不可用</Button>
          <IconButton label="查看提醒">
            <Bell aria-hidden="true" size={18} strokeWidth={1.75} />
          </IconButton>
        </div>
        <div className="showcase__row">
          <Badge>普通</Badge>
          <Badge tone="positive">已完成</Badge>
          <Badge tone="waiting">等待分析</Badge>
          <Badge tone="attention">需要决定</Badge>
        </div>
      </section>

      <section className="showcase__section" aria-labelledby="fields-title">
        <h2 id="fields-title">输入边界</h2>
        <div className="showcase__fields">
          <TextField label="条目标题" placeholder="写下现在想到的事" />
          <TextField error="标题不能为空" label="错误状态" value="" readOnly />
          <TextArea hint="保存后仍可继续整理" label="补充说明" rows={3} />
        </div>
      </section>

      <section className="showcase__section" aria-labelledby="progress-title">
        <h2 id="progress-title">进度与空状态</h2>
        <div className="showcase__grid">
          <ProgressBar label="AI 估算" value={42} />
          <EmptyState
            action={<Button size="compact">记录第一件事</Button>}
            description="先把它放进来，稍后再决定去哪里。"
            icon={Inbox}
            title="收集箱还是空的"
          />
        </div>
      </section>
    </main>
  )
}
