-- AlterTable
ALTER TABLE "trackers" ADD COLUMN     "ask_times" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "circle_id" UUID,
ADD COLUMN     "unit_label" TEXT;

-- AddForeignKey
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

