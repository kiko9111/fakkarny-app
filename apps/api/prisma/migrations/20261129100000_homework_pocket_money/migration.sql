-- AlterTable
ALTER TABLE "circle_tasks" ADD COLUMN     "reward" INTEGER,
ADD COLUMN     "subject" TEXT;

-- CreateTable
CREATE TABLE "pocket_money" (
    "id" UUID NOT NULL,
    "circle_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "task_id" UUID,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pocket_money_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pocket_money_task_id_key" ON "pocket_money"("task_id");

-- CreateIndex
CREATE INDEX "pocket_money_child_id_created_at_idx" ON "pocket_money"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "pocket_money_parent_id_created_at_idx" ON "pocket_money"("parent_id", "created_at");

-- AddForeignKey
ALTER TABLE "pocket_money" ADD CONSTRAINT "pocket_money_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_money" ADD CONSTRAINT "pocket_money_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_money" ADD CONSTRAINT "pocket_money_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pocket_money" ADD CONSTRAINT "pocket_money_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "circle_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row level security on, no policies (the API connects as the table owner).
ALTER TABLE "pocket_money" ENABLE ROW LEVEL SECURITY;
