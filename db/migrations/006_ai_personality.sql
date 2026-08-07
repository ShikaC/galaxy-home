-- AI personality prompt (user-editable tone; capability rules stay in code)
ALTER TABLE workspace_settings
ADD COLUMN ai_personality_prompt TEXT NOT NULL DEFAULT '语气温和务实，不批评、不制造内疚。先识别精力和阻碍，再缩小到当前可做的最小动作，也允许休息和重新规划。';
