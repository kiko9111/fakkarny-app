-- AlterTable
ALTER TABLE "users" ADD COLUMN     "next_tick_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "push_tickets" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_tickets_created_at_idx" ON "push_tickets"("created_at");

-- CreateIndex
CREATE INDEX "items_remind_at_idx" ON "items"("remind_at");

-- CreateIndex
CREATE INDEX "items_follow_up_at_idx" ON "items"("follow_up_at");

-- CreateIndex
CREATE INDEX "users_next_tick_at_idx" ON "users"("next_tick_at");


-- Row level security on, no policies (the API connects as the owner).
ALTER TABLE "push_tickets" ENABLE ROW LEVEL SECURITY;
