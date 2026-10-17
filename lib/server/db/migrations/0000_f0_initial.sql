CREATE TABLE `check_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`draft_version` integer NOT NULL,
	`ruleset_version` integer NOT NULL,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `check_runs_phase_idx` ON `check_runs` (`draft_id`,`draft_version`,`ruleset_version`,`phase`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`finding_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `decisions_draft_idx` ON `decisions` (`draft_id`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`shabad_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drafts_shabad_idx` ON `drafts` (`shabad_id`);--> statement-breakpoint
CREATE TABLE `drift_results` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drift_results_proposal_idx` ON `drift_results` (`proposal_id`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`draft_version` integer NOT NULL,
	`ruleset_version` integer NOT NULL,
	`state` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `findings_draft_idx` ON `findings` (`draft_id`,`draft_version`);--> statement-breakpoint
CREATE TABLE `lines` (
	`id` text PRIMARY KEY NOT NULL,
	`shabad_id` text NOT NULL,
	`ang` integer NOT NULL,
	`raag` text NOT NULL,
	`writer` text NOT NULL,
	`is_rahao` integer NOT NULL,
	`gurmukhi` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lines_shabad_idx` ON `lines` (`shabad_id`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `references` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`ruleset_version` integer NOT NULL,
	`id` text NOT NULL,
	`rule_version` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`ruleset_version`, `id`)
);
