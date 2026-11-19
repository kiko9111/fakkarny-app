-- CreateEnum
CREATE TYPE "Language" AS ENUM ('ar-EG', 'en');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('playful', 'balanced', 'calm');

-- CreateEnum
CREATE TYPE "CheckinInterval" AS ENUM ('2', '4', 'off');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('none', 'trial', 'monthly', 'yearly', 'expired');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'friend');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('chat', 'morning', 'night', 'reminder', 'checkin', 'followup');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('task', 'reminder', 'note', 'list_item', 'debt');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('open', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "DebtDirection" AS ENUM ('owed_to_me', 'i_owe');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('person', 'place', 'preference', 'fact');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_id" TEXT NOT NULL,
    "name" TEXT,
    "language" "Language" NOT NULL DEFAULT 'ar-EG',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "wake_time" TEXT NOT NULL DEFAULT '07:00',
    "sleep_time" TEXT NOT NULL DEFAULT '23:00',
    "tone" "Tone" NOT NULL DEFAULT 'balanced',
    "checkin_interval_h" "CheckinInterval" NOT NULL DEFAULT '2',
    "ignored_checkins" INTEGER NOT NULL DEFAULT 0,
    "plan" "Plan" NOT NULL DEFAULT 'none',
    "plan_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "push_token" TEXT,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'chat',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "remind_at" TIMESTAMP(3),
    "important" BOOLEAN NOT NULL DEFAULT false,
    "status" "ItemStatus" NOT NULL DEFAULT 'open',
    "debt_person" TEXT,
    "debt_amount" DECIMAL(12,2),
    "debt_direction" "DebtDirection",
    "follow_up_at" TIMESTAMP(3),
    "source_message_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summaries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "props_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_id_key" ON "users"("auth_id");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "messages_user_id_created_at_idx" ON "messages"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_user_id_client_id_key" ON "messages"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "items_user_id_status_due_at_idx" ON "items"("user_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "memories_user_id_subject_idx" ON "memories"("user_id", "subject");

-- CreateIndex
CREATE INDEX "summaries_user_id_period_end_idx" ON "summaries"("user_id", "period_end");

-- CreateIndex
CREATE INDEX "events_user_id_created_at_idx" ON "events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "events_name_created_at_idx" ON "events"("name", "created_at");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
