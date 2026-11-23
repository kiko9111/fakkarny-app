
-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photos_task_id_idx" ON "photos"("task_id");

-- CreateIndex
CREATE INDEX "photos_expires_at_idx" ON "photos"("expires_at");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "circle_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security on, no policies (the API connects as the owner).
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
