# 银河居所 Design System

## 0. Research Log

- Embedded refs: shortlisted Linear, Superhuman, Claude -> picked Linear's operational density and Superhuman's keyboard-first chrome, then rejected Linear purple and Claude parchment because neither belongs to a residence named for the night sky. Layer A is premium-calm craft (soft, not Awwwards marketing). Layer B is a custom night-observatory language, not a brand clone.
- Lazyweb: skipped. This is a local-first Chinese personal workspace; harvested grammar stays: fixed navigation, dominant today scan, explicit empty states, command palette as first-class.
- Imagen: skipped (image generation not requested). Signature object is a constellation brand mark plus a nebula wash, built in CSS/SVG so it survives offline.
- Interaction catalog: command-palette (fuzzy row highlight), shared-layout-bg (nav tick), drawer (AI), theme-toggle (instant token swap, no clip-path circus), button press translate.
- Direction lock: a night residence for one person's daily work. Ink velvet canvas, warm starlight type, aurora sage as the only action color. The memorable moment is the home header: a serif "今日空间" sitting in a quiet nebula, with today's counts beside it. The product remains a local-first personal space, not a project console.

Dials: `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 4`, `VISUAL_DENSITY: 6`.

## 1. Atmosphere & Identity

银河居所仍是本地优先的个人空间：随手记、待办、习惯、周期项目、回顾与可选 AI。它不是项目管理控制台，也不是宇宙插画墙。签名材料是「墨绒 + 星辉」：深色画布带着两团极光，文字偏暖，行动色是极光鼠尾草，强调色是炉火珊瑚色。白天主题「拂晓」是同一套语言的纸面版本，不是反相。

品牌与空间名分离。品牌是轨道星标 + 「银河居所」；空间名写在侧栏星标下方。没有营销英雄区、三列相同卡片、紫蓝渐变球体。

## 2. Color

Tokens live in `src/client/styles/tokens.css`. Night is the default.

| Role | Night | Dawn |
| --- | --- | --- |
| Canvas | `#0a0c11` | `#efe8dc` |
| Surface | `#11151d` | `#f7f2e9` |
| Surface raised | `#161b26` | `#fffaf3` |
| Text | `#eee6d6` | `#1c211c` |
| Action | `#8ec9ad` | `#2d6a52` |
| On action | `#0b1210` | `#f7f2e9` |
| Attention | `#e08a6c` | `#c45c42` |
| Reminder | `#d4a574` | `#a36b1f` |

Rules: green/sage is action and completion; coral is a decision; gold is waiting. Raw hex only in the token block. Adjacent surfaces differ by at least a 4% lightness step or a 1px rim.

## 3. Typography

No network fonts. Display serif for page titles only:

`"Iowan Old Style", "Palatino Linotype", "Songti SC", "STSong", serif`

UI: `"SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", system-ui, sans-serif`

| Role | Size / line-height | Weight |
| --- | --- | --- |
| Page title | 34px / 1.2 | 600 |
| Section | 17px / 1.35 | 600 |
| Item | 15px / 1.5 | 550 |
| Body | 14px / 1.6 | 400 |
| Label | 13px / 1.45 | 550 |
| Caption | 12px / 1.45 | 400 |

Page titles use the display stack. Buttons and tabs are `nowrap`. Content wraps by semantic group.

## 4. Spacing & Layout

4px base, same scale as before. Shell: `220px minmax(0, 1fr) 52px`. Main is the only page scroll owner. AI drawer overlays from the right. Content max `1120px`. Below `980px` the sidebar becomes an icon rail.

## 5. Components & Primitives

Button, IconButton, Field, Badge, Progress, EmptyState, Dialog, Drawer, Toast, Skeleton keep their state contracts. New: BrandMark (constellation), CommandPalette (Cmd+K), ThemeToggle, HomeSky (greeting + counts), WorkspaceDataPath (absolute data directory). Capture has two finishes: inbox (Enter) and today (⌘Enter); today overflow becomes 临时小事. Cycle project current tasks — manual or AI — can be added to today from the detail page; if today already has three primary items, that join becomes 临时小事. Completing a current task also completes linked todos of the same title. Completing a cycle task is one action; outcome, obstacle, and next task sit behind 记下成果, which closes after success. Starting the next stage shows the stage name and current task; outcome and next task sit behind 记下成果和下一任务, and next task may stay empty. While that card is up, the empty 等待设置 task block and the leftover next-task line stay hidden. Create-project and organize dialogs keep the required fields in view and hide optional planning behind a disclosure. Yesterday leftovers already on today do not reappear. Unconfigured AI on a project is a one-line link, not a panel. Home 今日收获 is a single-line composer, not a standing textarea. Cards are raised surfaces with a 1px rim; page sections may be framed panels. form-disclosure is a subtle inset surface with muted summary text. Field labels are caption-weight; controls are 36px to match buttons. Nav active state uses a sage tick, not a filled slab. First-run home is empty on purpose: no seeded demo todos or habits; the empty states point to 随手记.

## 6. Motion & Interaction

`--motion-fast: 140ms`, `--motion-base: 220ms`, `--motion-slow: 380ms`, `--motion-ease: cubic-bezier(0.22, 1, 0.36, 1)`. Press: `translateY(1px)`. GPU properties only. `prefers-reduced-motion: reduce` removes transforms and nebula drift, keeps color/opacity.

Cmd+K opens the command palette. Cmd+N opens capture. Theme swap is an instant token change.

## 7. Depth & Material

Night elevation is rim + tonal step, not drop-shadow soup. Overlays get a deeper scrim and a 20px radius. Grain is a static SVG overlay at low opacity. Nebula is two radial washes, frozen when reduced motion is on.

## 8. Accessibility & Debt

WCAG AA on final backgrounds. Focus ring is action color. One light and one dark theme, both complete. Accepted debt: system fonts vary by OS; Songti fallback is macOS-first; dedicated phone layout remains out of scope, but 768px must not overflow.
