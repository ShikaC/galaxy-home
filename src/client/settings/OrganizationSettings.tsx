import { CategorySettings } from "./CategorySettings.js"
import { QuoteSettings } from "./QuoteSettings.js"

export function OrganizationSettings() {
  return (
    <section className="settings-section">
      <header>
        <div>
          <h2>分类与每日短语</h2>
          <p>分类保持单层，条目可以同时属于多个分类；每日短语按日期随机出现。</p>
        </div>
      </header>
      <div className="settings-split">
        <CategorySettings />
        <QuoteSettings />
      </div>
    </section>
  )
}
