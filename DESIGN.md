# Galaxy · Personal Workspace

Status, 2026-09-10: sections 0–9 document the current implemented visual foundation. Section 10 describes the next product direction; it is not a claim of completed UI. Current requirements: [product-requirements.md](docs/product-requirements.md). Execution handoff: [handoff.md](docs/handoff.md).

## 0. Research and direction

2026-09-08: a product redesign authorized without the previous feature or visual boundaries. The implementation keeps proven local persistence and AI actions, and connects them through a daily workspace and a searchable notebook. Existing runtime and source are the reference, not the previous specification. The frontend design/layout/perfection rules and designpowers critique informed the implementation; the installed brand/style reference bundle is incomplete, so no external screen fidelity is claimed.

Product grammar: Notion informs the persistent workspace navigation and editable knowledge; Linear informs compact task rows and clear state; the existing AI drawer supplies contextual work without navigation. These are interaction references, not copied visual identities.

## 1. Identity

Warm editorial software for an independent knowledge worker. A deep ink navigation surface frames a warm paper canvas. Terracotta identifies AI and the next meaningful action. The signature is a typographic daily briefing, a precise orbit brand, and a softly elevated AI composer. Actual personal data takes precedence over decorative metrics.

## 2. Palette

Canvas #f8f7f4; surface #ffffff; subtle #f1efea; hover #eeece6; selected #f6e9df. Ink #292b29; muted #6d6d68; faint #73726a; border #e5e2db; strong #cbc7bd. Action #ac4f2b; hover #954323; soft #f8eade. Success #47715a. Sidebar #242824; sidebar text #e9eae4; sidebar muted #a3aaa0; sidebar hover #333932. Dark focus surface #303b32. Contrast and readable long Chinese copy outrank decoration.

文字色必须在它会出现的每一层底色上达到 WCAG AA 的 4.5:1。这要求把两层安静文字都调深，代价是 muted 与 faint 的层级差从 ΔL* 8.4 压到 2.0——在浅色纸面上，比 muted 更浅的文字不可能同时满足 AA。默认用 muted；faint 保留给最次要的辅助文字，它仍然合规，但不应再被当成一个独立的视觉层级。faint 不落在 surface-subtle 及更深的底色上，那里用 muted。

## 3. Typography

UI: SF Pro Text, PingFang SC, Microsoft YaHei, system-ui. Editorial greeting: Georgia with Songti SC/Noto Serif CJK SC fallback. Brand: Georgia. Sizes: display 32, title 18, heading 15, body 14, action 13, metadata 12, micro 11. Monospaced numbers use SFMono-Regular, Consolas. Headings remain compact enough for useful work above the fold.

## 4. Layout

Desktop: 232px sidebar, fluid main, optional 380px AI panel. Main has sticky 64px toolbar, 40px page padding, max width 1320px. Home uses a 1.8fr work column and a minmax(260px, .9fr) personal context column. Below 1120px sidebar becomes 68px; below 900px home stacks; below 600px navigation becomes a horizontal icon strip. Mobile AI panel overlays and can always close. Main and drawer independently scroll with min-inline-size/min-block-size zero.

Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48px. Control radius 8px, tools 12px, highlighted composer 16px. Reuse CSS variables and existing Button, Field, ModalSurface, TaskRow primitives.

## 5. Components

WorkspaceSidebar: identity, search, create, navigation, recent projects, AI entry, profile. WorkspaceToolbar: current location, local persistence status, AI toggle. DailyBrief: real task counts, date and greeting. AiLaunchpad: input, suggested prompts, provider state; Enter opens draft in actual AI composer. WorkQueue: today/inbox tabs, task completion, task edit, add. ProjectPreview: live projects and explicit empty create path. FocusTimer: 25/50 minute modes, start/pause/reset, deadline-based elapsed time persisted across navigation and reload. Notebook: searchable list, editable document, explicit save with dirty-state navigation guard, pin/archive, Markdown export, contextual AI prompts. Empty, loading, error and success states are required. Existing task/project/habit/review/settings routes receive the same palette and shell.

## 6. Motion

120ms state tint, 180ms panel entrance, 240ms page reveal. Only opacity and small translate are animated. Focus ring 2px terracotta, controls at least 36px, mobile targets 44px. Reduced motion disables transitions and animations. No perpetual decoration.

## 7. Material

Sidebar and focus tool are matte dark. Paper sections rely on spacing and separators. AI composer has a fine warm border and restrained ambient shadow. Project previews use quiet tonal fills. No fake analytics, invented assistant output, or synthetic user data. Icons are Lucide; orbit identity is CSS, never screenshot imagery.

## 8. Accessibility and verification

One main, explicit labels on all controls, semantic tabs or pressed buttons, keyboard shortcuts ignored during IME composition, keyboard reachable mobile navigation. Verify 375/768/1440 widths, long text, empty workspaces, populated workspaces, AI unconfigured/error, notebook persistence and focus reload. Existing React dev instrumentation remains development-only. Automated AI regression uses fixture providers. Authorized real-model QA uses an isolated synthetic workspace and records calls separately from fixtures.

## 9. Action planning workspace

A dedicated /plans route connects knowledge and scheduled tasks. A quiet history rail frames a single composer or durable plan. Day sections show allocated minutes, concrete outcomes and source chips; one explicit confirmation precedes writes. Source snapshots and technical run details use progressive disclosure. Empty, generating, confirmation, clarification, unavailable, cancelled and verified states are first-class. At 800px the history follows the workbench; at 480px date controls wrap. All colors, spacing, type and surfaces inherit existing light/night tokens. No fabricated model response, costs or metrics.

2026-09-10 live usage refinement: generated plans open immediately as durable runs, with honest waiting/cancel states. Clarification retains the question and original goal while accepting a focused answer. Draft editing reuses Field/Button primitives, with task title, minutes, day selection, removal and visible daily totals; saving returns to a separate confirmation step. Existing-task titles stay fixed to preserve identity. Revision conflicts show a recoverable message. Long original goals use body typography under disclosure rather than oversized repeated headings. Citation chips open the associated source snapshot. QA uses the user's explicitly authorized real provider with synthetic data in an isolated workspace; automated regression tests use fixtures.


## 10. Next product direction: tasks, time and integrated AI

The next design centers on capture, organization, scheduling, execution, replanning and review. Keep the current token system and accessible primitives where they support this flow. Navigation, the home surface and task details may change; previous dimensions and page composition are the current baseline, not a fixed layout for the next product.

- Primary surfaces: inbox, today, upcoming work, lists / saved filters and a day / week calendar. Exact navigation is a design proposal to validate during implementation.
- Task rows expose completion, priority and time clearly. Details handle subtasks, recurrence and reminders. Batch actions, keyboard operation and quick edits reduce repetitive navigation.
- Calendar views distinguish deadlines, scheduled blocks, fixed events and unscheduled work; conflicts and capacity are visible without requiring an AI conversation.
- AI actions appear where the work happens. Capture previews extracted fields; replanning previews the exact changes and reasons before confirmation. The existing drawer and /plans route can support migration while these flows are tested.
- Notes, projects, habits and review support the task flow. Their existing data remains accessible during the transition.
- Desktop density, mobile capture and touch targets need separate usability validation. A narrow screenshot does not demonstrate cross-device synchronization.
- Preserve current failure recovery, unsaved-input protection and accessible focus behavior. Add empty / loading / error / offline / conflict / recurring-instance states as their features arrive.

The first design acceptance scenario is defined in the product requirements. Validate actual task and calendar interactions, with long Chinese text, keyboard / IME input, 375 / 768 / 1440 widths and both themes. Visual completion alone does not establish task semantics, notification reliability or successful migration.
