import { Bell, Bot, Inbox, Plus, Sparkles, X } from "lucide-react"
import { useState } from "react"
import { Button } from "../components/ui/Button.js"
import { EmptyState } from "../components/ui/EmptyState.js"
import { Skeleton, Toast } from "../components/ui/Feedback.js"
import { TextArea, TextField } from "../components/ui/Field.js"
import { IconButton } from "../components/ui/IconButton.js"
import { DialogSurface, DrawerSurface } from "../components/ui/ModalSurface.js"
import { Badge, ProgressBar } from "../components/ui/Status.js"

function Sample({
  children,
  label,
}: {
  readonly children: React.ReactNode
  readonly label: string
}) {
  return (
    <div className="showcase__sample">
      <span>{label}</span>
      {children}
    </div>
  )
}

export function DesignShowcasePage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
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

      <section aria-labelledby="commands-title" className="showcase__section">
        <div className="showcase__section-heading">
          <h2 id="commands-title">Button 与 IconButton</h2>
          <Badge tone="positive">命令状态</Badge>
        </div>
        <div className="showcase__samples">
          <Sample label="默认">
            <Button>
              <Plus size={16} />
              新建条目
            </Button>
          </Sample>
          <Sample label="焦点">
            <Button className="showcase-focus" variant="secondary">
              稍后处理
            </Button>
          </Sample>
          <Sample label="禁用">
            <Button disabled>不可用</Button>
          </Sample>
          <Sample label="加载">
            <Button loading>保存更改</Button>
          </Sample>
          <Sample label="成功">
            <Button status="success">已保存</Button>
          </Sample>
          <Sample label="错误">
            <Button status="error">保存失败</Button>
          </Sample>
          <Sample label="图标命令">
            <IconButton label="查看提醒">
              <Bell size={18} strokeWidth={1.75} />
            </IconButton>
          </Sample>
        </div>
      </section>

      <section aria-labelledby="fields-title" className="showcase__section">
        <h2 id="fields-title">字段与选择控件</h2>
        <div className="showcase__fields">
          <TextField label="默认字段" placeholder="写下现在想到的事" />
          <TextField
            className="showcase-control-focus"
            label="焦点字段"
            value="可继续输入"
            readOnly
          />
          <TextField disabled label="禁用字段" value="暂不可编辑" />
          <TextField error="标题不能为空" label="错误字段" value="" readOnly />
          <TextArea hint="保存后仍可继续整理" label="补充说明" rows={3} />
        </div>
        <div className="showcase__row">
          <label className="showcase-check">
            <input defaultChecked type="checkbox" />
            默认复选框
          </label>
          <label className="showcase-check">
            <input disabled type="checkbox" />
            禁用复选框
          </label>
          <label className="showcase-switch">
            <input aria-checked="true" defaultChecked type="checkbox" role="switch" />
            <span />
            提醒开关
          </label>
          <fieldset className="segmented">
            <legend className="sr-only">展示方式</legend>
            <button aria-pressed="true" type="button">
              列表
            </button>
            <button aria-pressed="false" type="button">
              日历
            </button>
            <button disabled type="button">
              禁用
            </button>
          </fieldset>
        </div>
      </section>

      <section aria-labelledby="feedback-title" className="showcase__section">
        <h2 id="feedback-title">Badge、Progress、Toast 与 Skeleton</h2>
        <div className="showcase__row">
          <Badge>普通</Badge>
          <Badge tone="positive">已完成</Badge>
          <Badge tone="waiting">等待分析</Badge>
          <Badge tone="attention">需要决定</Badge>
        </div>
        <div className="showcase__feedback">
          <ProgressBar label="AI 估算" value={42} />
          <Toast>更改已保存</Toast>
          <Toast tone="error">保存失败，请重试</Toast>
          <Skeleton />
        </div>
      </section>

      <section aria-labelledby="surfaces-title" className="showcase__section">
        <h2 id="surfaces-title">Dialog、Drawer 与 EmptyState</h2>
        <div className="showcase__row">
          <Button onClick={() => setDialogOpen(true)} variant="secondary">
            打开对话框
          </Button>
          <Button onClick={() => setDrawerOpen(true)} variant="secondary">
            打开抽屉
          </Button>
        </div>
        <EmptyState
          action={<Button size="compact">记录第一件事</Button>}
          description="先把它放进来，稍后再决定去哪里。"
          icon={Inbox}
          title="收集箱还是空的"
        />
      </section>

      {dialogOpen ? (
        <DialogSurface ariaLabelledBy="showcase-dialog-title" onClose={() => setDialogOpen(false)}>
          <header className="dialog__header">
            <div>
              <p className="eyebrow">Dialog</p>
              <h2 id="showcase-dialog-title">确认这项更改</h2>
            </div>
            <IconButton label="关闭示例对话框" onClick={() => setDialogOpen(false)}>
              <X size={18} />
            </IconButton>
          </header>
          <p>对话框限制在 560px 内，并管理焦点与背景交互。</p>
          <footer className="dialog__actions">
            <Button onClick={() => setDialogOpen(false)} variant="ghost">
              取消
            </Button>
            <Button onClick={() => setDialogOpen(false)}>确认</Button>
          </footer>
        </DialogSurface>
      ) : null}
      {drawerOpen ? (
        <DrawerSurface ariaLabel="示例 AI 抽屉" onClose={() => setDrawerOpen(false)}>
          <header className="drawer__header">
            <span className="drawer__title">
              <Bot size={19} />
              <strong>星伴</strong>
            </span>
            <IconButton label="关闭示例抽屉" onClick={() => setDrawerOpen(false)}>
              <X size={18} />
            </IconButton>
          </header>
          <div className="drawer__body">
            <EmptyState description="这里会显示对话内容。" icon={Bot} title="新会话" />
          </div>
        </DrawerSurface>
      ) : null}
    </main>
  )
}
