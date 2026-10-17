CREATE TABLE `publications` (
	`reference_id` text PRIMARY KEY NOT NULL,
	`shabad_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `publications_shabad_idx` ON `publications` (`shabad_id`);--> statement-breakpoint
CREATE TABLE `sequences` (
	`kind` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
