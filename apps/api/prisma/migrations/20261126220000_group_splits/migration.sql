-- AlterTable
ALTER TABLE "splits" ADD COLUMN     "circle_id" UUID,
ADD COLUMN     "member_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateIndex
CREATE INDEX "splits_member_ids_idx" ON "splits" USING GIN ("member_ids");

-- AddForeignKey
ALTER TABLE "splits" ADD CONSTRAINT "splits_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

