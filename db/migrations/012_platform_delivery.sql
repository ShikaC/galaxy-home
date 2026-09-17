-- 平台投递与应用内横幅是两条独立的投递通道，各自记录首次投递时间。
-- 此前只有一个 delivered_at，桌面进程无法判断某条提醒是否已经由它转成系统通知，
-- 只能把去重状态放在渲染进程的 localStorage 里；换 WebView 来源或清空存储就会重复弹窗。
ALTER TABLE notification_events ADD COLUMN platform_delivered_at TEXT;

CREATE INDEX notification_events_platform_pending
  ON notification_events(platform_delivered_at, dismissed_at, scheduled_at);
