-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'accepted', 'declined', 'done', 'cancelled');

-- CreateTable
CREATE TABLE "circle_tasks" (
    "id" UUID NOT NULL,
    "circle_id" UUID NOT NULL,
    "assigner_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "item_id" UUID,
    "responded_at" TIMESTAMP(3),
    "done_at" TIMESTAMP(3),
    "nudges" INTEGER NOT NULL DEFAULT 0,
    "last_nudge_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_posts" (
    "id" UUID NOT NULL,
    "circle_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "actor_id" UUID,
    "target_id" UUID,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "circle_tasks_item_id_key" ON "circle_tasks"("item_id");

-- CreateIndex
CREATE INDEX "circle_tasks_circle_id_status_idx" ON "circle_tasks"("circle_id", "status");

-- CreateIndex
CREATE INDEX "circle_tasks_assignee_id_status_idx" ON "circle_tasks"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "circle_tasks_assigner_id_status_idx" ON "circle_tasks"("assigner_id", "status");

-- CreateIndex
CREATE INDEX "circle_posts_circle_id_created_at_idx" ON "circle_posts"("circle_id", "created_at");

-- AddForeignKey
ALTER TABLE "circle_tasks" ADD CONSTRAINT "circle_tasks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_tasks" ADD CONSTRAINT "circle_tasks_assigner_id_fkey" FOREIGN KEY ("assigner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_tasks" ADD CONSTRAINT "circle_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_posts" ADD CONSTRAINT "circle_posts_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security: only the API (service role) reads these tables.
ALTER TABLE "circle_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circle_posts" ENABLE ROW LEVEL SECURITY;
