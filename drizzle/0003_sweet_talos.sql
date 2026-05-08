CREATE TABLE `document_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`client_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime` text NOT NULL,
	`byte_length` integer NOT NULL,
	`storage_path` text NOT NULL,
	`classification_json` text,
	`chosen_entity_kind` text,
	`created_entity_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_uploads_org_idx` ON `document_uploads` (`org_id`);--> statement-breakpoint
CREATE INDEX `document_uploads_client_idx` ON `document_uploads` (`client_id`);--> statement-breakpoint
CREATE INDEX `document_uploads_uploader_idx` ON `document_uploads` (`uploader_id`);