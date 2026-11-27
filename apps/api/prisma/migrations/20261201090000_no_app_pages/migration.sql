-- AlterTable
ALTER TABLE "house_list_items" ADD COLUMN     "added_by_name" TEXT,
ADD COLUMN     "done_by_name" TEXT;

-- AlterTable
ALTER TABLE "house_lists" ADD COLUMN     "share_code" TEXT;

-- CreateTable
CREATE TABLE "link_tasks" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "creator_id" UUID NOT NULL,
    "circle_id" UUID,
    "other_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "due_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "done_at" TIMESTAMP(3),
    "web_views" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_tasks_code_key" ON "link_tasks"("code");

-- CreateIndex
CREATE INDEX "link_tasks_creator_id_status_idx" ON "link_tasks"("creator_id", "status");

-- CreateIndex
CREATE INDEX "link_tasks_circle_id_idx" ON "link_tasks"("circle_id");

-- CreateIndex
CREATE UNIQUE INDEX "house_lists_share_code_key" ON "house_lists"("share_code");

-- AddForeignKey
ALTER TABLE "link_tasks" ADD CONSTRAINT "link_tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_tasks" ADD CONSTRAINT "link_tasks_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row level security on, no policies (the API connects as the table owner).
ALTER TABLE "link_tasks" ENABLE ROW LEVEL SECURITY;
