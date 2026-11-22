-- Repeating reminders ("every hour"): minutes between occurrences.
ALTER TABLE "items" ADD COLUMN "repeat_every_minutes" INTEGER;
