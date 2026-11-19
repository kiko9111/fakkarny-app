-- AlterTable
ALTER TABLE "items" ADD COLUMN     "followed_up_at" TIMESTAMP(3),
ADD COLUMN     "nudge" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "always_direct" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_checkin_at" TIMESTAMP(3),
ADD COLUMN     "last_morning_at" TIMESTAMP(3),
ADD COLUMN     "last_night_at" TIMESTAMP(3),
ADD COLUMN     "last_user_message_at" TIMESTAMP(3),
ADD COLUMN     "slowdown_noticed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "devices_push_token_key" ON "devices"("push_token");

