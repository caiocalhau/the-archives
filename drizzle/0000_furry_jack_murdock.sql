CREATE TABLE IF NOT EXISTS `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `editions` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`title` text NOT NULL,
	`language` text,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `editions_work_id` ON `editions` (`work_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `work_authors` (
	`work_id` text NOT NULL,
	`author_id` text NOT NULL,
	PRIMARY KEY(`work_id`, `author_id`),
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `work_series` (
	`work_id` text NOT NULL,
	`series_id` text NOT NULL,
	`position` text,
	PRIMARY KEY(`work_id`, `series_id`),
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `work_subjects` (
	`work_id` text NOT NULL,
	`subject_id` text NOT NULL,
	PRIMARY KEY(`work_id`, `subject_id`),
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `works` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`first_publish_year` integer,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS work_titles USING fts5(
  work_id UNINDEXED,
  title,
  tokenize = 'unicode61 remove_diacritics 2'
);
