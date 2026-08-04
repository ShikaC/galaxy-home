import { useState } from "react"
import { PageHeader } from "../components/PageHeader.js"
import { AiSettings } from "../settings/AiSettings.js"
import { DataSettings } from "../settings/DataSettings.js"
import { MemorySettings } from "../settings/MemorySettings.js"
import { OrganizationSettings } from "../settings/OrganizationSettings.js"
import { ProfileSettings } from "../settings/ProfileSettings.js"
import { ReminderSettings } from "../settings/ReminderSettings.js"

const SECTIONS = [
  "个人空间",
  "AI 服务",
  "提醒",
  "分类与短语",
  "AI 记忆",
  "数据与回收站",
  "快捷键",
] as const
type Section = (typeof SECTIONS)[number]

export function SettingsPage() {
  const [section, setSection] = useState<Section>("个人空间")
  return (
    <div className="page">
      <PageHeader subtitle="所有配置只作用于这台电脑上的个人空间。" title="设置" />
      <div className="settings-layout">
        <nav aria-label="设置栏目" className="settings-nav">
          {SECTIONS.map((entry) => (
            <button
              className={section === entry ? "selected" : ""}
              key={entry}
              onClick={() => setSection(entry)}
              type="button"
            >
              {entry}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === "个人空间" ? (
            <ProfileSettings />
          ) : section === "AI 服务" ? (
            <AiSettings />
          ) : section === "提醒" ? (
            <ReminderSettings />
          ) : section === "分类与短语" ? (
            <OrganizationSettings />
          ) : section === "AI 记忆" ? (
            <MemorySettings />
          ) : section === "数据与回收站" ? (
            <DataSettings />
          ) : (
            <section className="settings-section">
              <header>
                <h2>快捷键</h2>
                <p>随时捕捉与搜索使用不同组合，保存后会回到当前页面。</p>
              </header>
              <dl className="shortcut-list">
                <div>
                  <dt>随手记</dt>
                  <dd>
                    <kbd>⌘ / Ctrl</kbd>
                    <span>+</span>
                    <kbd>K</kbd>
                  </dd>
                </div>
                <div>
                  <dt>全局搜索</dt>
                  <dd>
                    <kbd>⌘ / Ctrl</kbd>
                    <span>+</span>
                    <kbd>Shift</kbd>
                    <span>+</span>
                    <kbd>K</kbd>
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
