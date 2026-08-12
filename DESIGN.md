# 银河居所 Design System

## 0. Research Log

- Embedded refs: shortlisted Notion, Intercom, Linear -> picked `taste-skill` + Notion because the product needs a warm, low-pressure workspace with clear information hierarchy rather than a high-urgency project console.
- Lazyweb: 3 desktop queries, 4 shipped screens viewed (Sunsama, Todoist, Weekrise, Linear) -> kept the low-noise fixed navigation, a dominant "today" scan path, explicit empty states, and review charts below primary actions. No pixels, assets, or brand language are copied.
- Interaction catalog: read beui.dev `shared-layout-bg`, `button`, and `drawer` sources -> use interruptible background movement for navigation, explicit async button states, and an escape-dismissable right drawer with a reduced-motion opacity fallback.
- Imagen drafts: `docs/design-research/concept-a.png`, `docs/design-research/concept-b.png` -> picked `concept-a.png` as the geometry and density reference because it matches the confirmed five-item navigation, fixed home regions, and independent AI entry.
- Design read: a desktop personal workspace for one user, with a calm operational language, leaning toward warm paper surfaces, forest-green action color, and compact Chinese typography. Post-V1 visual pass (2026-08): keep the desk metaphor, strengthen the quiet “star-trail” focus on canvas, brand mark, home quote band, and settings headers — still no cosmic illustration wall.
- Dials: `DESIGN_VARIANCE: 4`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 6`.

## 1. Atmosphere & Identity

银河居所应像一张每天重新铺开的安静书桌：信息足够紧凑，但不催促；完成、暂停和休息都以同样稳定的语气呈现。签名视觉是“星轨焦点”：森林绿只沿当前导航、今日重点和完成反馈形成一条克制的行动轨迹，珊瑚色只提示需要用户决定的边界状态。

品牌与个人空间名称必须分离。品牌标记由圆形轨道与 `Sparkles` 图标组成，旁边显示“银河居所”；空间名称在主内容顶部显示。界面不使用营销式英雄区、装饰卡片墙、渐变光球或宇宙插画来解释功能。

主要使用者：

- 低精力时仍想记下一件事的人，需要最短捕捉路径和无评判反馈。
- 正在推进多个长期目标的人，需要只看当前阶段而非完整任务树。
- 只用键盘快速整理的人，需要可见焦点、稳定顺序和明确快捷入口。

## 2. Color

### Palette

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Canvas | `--color-canvas` | `#f3f5f1` | App background (with quiet star-trail washes) |
| Surface | `--color-surface` | `#ffffff` | Main work surface and overlays |
| Surface subtle | `--color-surface-subtle` | `#f6f8f4` | Sidebar, grouped rows, quiet bands |
| Surface selected | `--color-surface-selected` | `#e7f0e8` | Active navigation and selected rows |
| Surface hover | `--color-surface-hover` | `#eef3ee` | Hover/focus washes on quiet controls |
| Text primary | `--color-text` | `#1f241f` | Headings and body |
| Text secondary | `--color-text-muted` | `#5f6a5f` | Metadata and supporting copy |
| Text tertiary | `--color-text-faint` | `#879087` | Placeholders and disabled labels |
| Border | `--color-border` | `#d9e0d8` | Whisper boundaries |
| Border strong | `--color-border-strong` | `#c2cbc2` | Inputs and active separators |
| Action | `--color-action` | `#246f4b` | Primary actions, focus path, completion |
| Action hover | `--color-action-hover` | `#1c5c3c` | Hover and pressed action |
| Action soft | `--color-action-soft` | `#e4f1ea` | Selection and positive badges |
| Attention | `--color-attention` | `#d65f45` | Decisions, overdue, recoverable errors |
| Attention soft | `--color-attention-soft` | `#fff0eb` | Attention background |
| Reminder | `--color-reminder` | `#b7791f` | Reminder and pending analysis |
| Reminder soft | `--color-reminder-soft` | `#fff7e3` | Reminder background |
| Chart secondary | `--color-chart-secondary` | `#4f7f86` | Secondary chart series only |

Rules:

- Green carries action and positive state; coral carries user attention; amber carries waiting. Never use semantic color decoratively.
- Text and icons must meet WCAG AA on their final background.
- Raw color literals live only in the global token block. Components consume semantic variables.
- The application ships one light theme in v1. A future dark theme must be defined as a complete palette, not section-by-section inversion.

## 3. Typography

Use the local system font stack to avoid network dependencies and provide strong CJK metrics:

`"SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`.

| Role | Token | Size / line-height | Weight |
| --- | --- | --- | --- |
| Page title | `--type-page` | `28px / 1.3` | 650 |
| Section title | `--type-section` | `18px / 1.4` | 650 |
| Item title | `--type-item` | `15px / 1.5` | 550 |
| Body | `--type-body` | `14px / 1.6` | 400 |
| Label | `--type-label` | `13px / 1.45` | 550 |
| Caption | `--type-caption` | `12px / 1.45` | 400 |

All letter spacing is `0`. Page titles are compact work-surface headings, never hero-scale. Chinese phrases wrap by semantic group where possible; buttons and tabs use `white-space: nowrap`, while content uses `overflow-wrap: anywhere` only for unbroken strings.

## 4. Spacing & Layout

Spacing uses a 4px base: `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`.

App shell:

- `min-block-size: 100dvb`; viewport body never scrolls.
- Desktop columns: `224px minmax(0, 1fr) 52px`. The right column is the AI launcher rail.
- Main work surface owns vertical scroll and always has `min-block-size: 0`.
- Open AI drawer is `360px` and overlays from the right without changing the active route.
- Main content maximum width is `1180px`, centered with `32px` inline padding and `28px` block padding.
- Home uses `minmax(0, 1.45fr) minmax(320px, 0.8fr)`; intrinsic sections collapse below `1120px`.
- Below `980px`, the left navigation becomes a `68px` icon rail with accessible tooltips. Dedicated phone layout is out of scope, but no horizontal overflow is allowed at `768px`.
- Responsive page composition follows the available `.main-scroll` container when the AI drawer compresses the work surface. At a `720px` container width, todos, habits, gains, review, and other multi-column page regions must stack or reflow so content remains readable at the accepted `768px` viewport.

Scroll ownership: navigation stays fixed, main page scrolls, AI drawer body scrolls independently. Modals lock background scroll. Nested page-section scrollbars are prohibited.

## 5. Components & Primitives

### Core Primitives

- `Button`: primary, secondary, ghost, and danger variants; 36px regular height, 32px compact height, 6px radius. States: default, hover, active, focus-visible, disabled, loading, success, error.
- `IconButton`: 36px square, 6px radius, Lucide icon at 18px and stroke 1.75. Every instance has an accessible name and tooltip.
- `TextField` / `TextArea`: label, optional hint, inline error, 40px minimum height, 6px radius. Focus uses action ring, error uses attention ring.
- `Checkbox` / `Switch`: native input semantics with custom visuals. Checked motion draws or moves only when reduced motion is not requested.
- `SegmentedControl`: view/mode selection only, shared selected background, arrow-key navigation.
- `Badge`: status and metadata only. Pill radius is allowed here; badges are never commands.
- `ProgressBar`: fixed 6px track, text label always includes “AI 估算” when used for projects.
- `Dialog`: centered overlay, maximum 560px, focus trap, escape and close button, destructive actions require explicit wording.
- `Drawer`: 360px right surface, focus-managed, escape-dismissable, background remains visible but inert.
- `Toast`: transient confirmation/error, maximum three, no core data lives only in a toast.
- `EmptyState`: icon, one plain sentence, one primary path. No large illustration.
- `Skeleton`: mirrors the final row/block geometry; no generic spinner for page loading.

### Product Patterns

- `AppShell`: fixed navigation, scroll-body main, AI launcher rail, overlays.
- `NavItem`: icon + label + optional count, selected and hover backgrounds glide within the list.
- `SectionBand`: unframed page section with title/action row and optional divider. Page sections do not become floating cards.
- `TaskRow`: checkbox, title, metadata, focus marker, and overflow action menu. Stable 56px minimum row height.
- `QuickCapture`: title input plus compact capture actions; saves without navigating away.
- `HabitRow`: completion control, count/target, schedule context, and undo action.
- `ProjectRow`: name, current stage/task, compact “AI 估算” progress, and pin action.
- `GainEntry`: timestamp, editable text, and delete action.
- `CalendarGrid`: seven fixed columns with 40px cells; historical correction states have visible markers.
- `ChartFrame`: Recharts container with fixed 220px height, accessible summary text, no layout shift.

Primitive showcase route: `/design-system` must render every core primitive in default, focus, disabled, loading, empty, and error states before product pages are considered visually complete.

## 6. Motion & Interaction

Motion tokens:

- `--motion-fast: 120ms`; hover tint, focus reveal.
- `--motion-base: 180ms`; drawers, dialogs, row insertion/removal.
- `--motion-ease: cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Press feedback: `transform: translateY(1px)` for enabled buttons only.

Mechanisms:

- Navigation adapts beui.dev `shared-layout-bg`: one background plane moves between hover/selected rows; no blur over 2px and no bounce.
- Async actions adapt `StatefulButton`: label/icon transition between idle, loading, success, and recoverable error without changing row height.
- AI uses the catalog `drawer` mechanism: transform/opacity entrance, escape close, backdrop only for modal-width states, body scroll lock when overlaying narrow windows.
- List insertion/removal uses opacity plus `translateY(4px)`; drag sorting uses dnd-kit transform only.

`prefers-reduced-motion: reduce` removes transforms and shared-plane travel, sets durations to 1ms, and retains color/opacity state feedback. No perpetual animation is allowed.

## 7. Depth & Material

Hierarchy is mostly tonal and spatial:

- Level 0: canvas and main content, no shadow.
- Level 1: rows and grouped tools, whisper border or tonal fill, never both without a state reason.
- Level 2: popovers and compact menus use `0 6px 22px rgb(32 35 31 / 0.08)` plus border.
- Level 3: dialogs and the AI drawer use `0 18px 52px rgb(32 35 31 / 0.12)` plus border.

Cards cap at 8px radius. Page sections are unframed bands; cards are reserved for repeated project/habit items, modals, and genuinely framed tools. Cards never nest inside cards.

## 8. Accessibility Constraints & Accepted Debt

Constraints:

- Every route has one `main`, a unique page heading, labeled regions, and a logical heading hierarchy.
- All workflows are keyboard reachable with visible `2px` focus rings and no keyboard trap.
- Icon-only controls have `aria-label` plus hover/focus tooltip. Pointer targets are at least 36px in this desktop-only v1.
- Dialogs and drawers restore focus to their trigger. Destructive dialogs name the object and consequence.
- Charts include text summaries and do not encode meaning by color alone.
- Notifications request browser permission only after explicit user action.
- Long Chinese titles, 200-character notes, empty lists, and unbroken URLs must not overlap or force primary horizontal scrolling.

Accepted debt for v1:

- No dedicated phone composition; responsive support protects data and interaction down to 768px desktop/tablet widths.
- System fonts vary slightly across Windows and macOS; screenshots are accepted within font-metric differences, but CJK wrapping must remain natural.
- Browser notifications only run while the application is open, matching the product specification.
- Voice capture depends on browser `MediaRecorder` and a configured transcription service; the non-AI text capture path is always available.
