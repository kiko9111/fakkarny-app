
-- AlterTable
ALTER TABLE "circle_tasks" ADD COLUMN     "homework" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "remind_at" TIMESTAMP(3);

