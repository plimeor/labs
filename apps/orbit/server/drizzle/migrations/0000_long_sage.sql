CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`workspace_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_active_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_name_unique` ON `agents` (`name`);--> statement-breakpoint
CREATE TABLE `agent_inbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_agent` text NOT NULL,
	`to_agent` text NOT NULL,
	`message` text NOT NULL,
	`message_type` text DEFAULT 'message' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_to_agent` ON `agent_inbox` (`to_agent`);--> statement-breakpoint
CREATE INDEX `idx_inbox_status` ON `agent_inbox` (`status`);--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_name` text NOT NULL,
	`name` text,
	`prompt` text NOT NULL,
	`schedule_type` text NOT NULL,
	`schedule_value` text NOT NULL,
	`context_mode` text DEFAULT 'isolated' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`next_run` integer,
	`last_run` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_next_run` ON `scheduled_tasks` (`next_run`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `scheduled_tasks` (`status`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_name` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`started_at` integer NOT NULL,
	`last_message_at` integer,
	`message_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_session_agent` ON `chat_sessions` (`agent_name`);--> statement-breakpoint
CREATE INDEX `idx_session_id` ON `chat_sessions` (`session_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`agent_name` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_message_session` ON `messages` (`session_id`);