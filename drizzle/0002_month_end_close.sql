CREATE TABLE `month_end_closes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`client_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`accounting_method` text NOT NULL,
	`baseline_key` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`input_snapshot` text NOT NULL,
	`findings` text NOT NULL,
	`narrative` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `month_end_closes_org_idx` ON `month_end_closes` (`org_id`);--> statement-breakpoint
CREATE INDEX `month_end_closes_client_idx` ON `month_end_closes` (`client_id`);--> statement-breakpoint
CREATE INDEX `month_end_closes_period_idx` ON `month_end_closes` (`client_id`,`period_start`,`period_end`);--> statement-breakpoint
CREATE TABLE `month_end_finding_dispositions` (
	`id` text PRIMARY KEY NOT NULL,
	`close_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`disposition` text NOT NULL,
	`note` text,
	`user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`close_id`) REFERENCES `month_end_closes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `month_end_finding_dispositions_uidx` ON `month_end_finding_dispositions` (`close_id`,`finding_id`);--> statement-breakpoint
CREATE INDEX `month_end_finding_dispositions_close_idx` ON `month_end_finding_dispositions` (`close_id`);--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `context_kind` text;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `context_id` text;--> statement-breakpoint
CREATE INDEX `chat_threads_context_idx` ON `chat_threads` (`context_kind`,`context_id`);