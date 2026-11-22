-- CreateEnum
CREATE TYPE "DaftarStatus" AS ENUM ('pending', 'confirmed', 'disputed', 'settled', 'cancelled');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'update';

-- CreateTable
CREATE TABLE "daftar_entries" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "creator_id" UUID NOT NULL,
    "circle_id" UUID,
    "other_name" TEXT NOT NULL,
    "other_user_id" UUID,
    "direction" "DebtDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "note" TEXT,
    "status" "DaftarStatus" NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "responded_via" TEXT,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daftar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daftar_entries_code_key" ON "daftar_entries"("code");

-- CreateIndex
CREATE INDEX "daftar_entries_creator_id_status_idx" ON "daftar_entries"("creator_id", "status");

-- CreateIndex
CREATE INDEX "daftar_entries_other_user_id_status_idx" ON "daftar_entries"("other_user_id", "status");

-- AddForeignKey
ALTER TABLE "daftar_entries" ADD CONSTRAINT "daftar_entries_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daftar_entries" ADD CONSTRAINT "daftar_entries_other_user_id_fkey" FOREIGN KEY ("other_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daftar_entries" ADD CONSTRAINT "daftar_entries_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row level security on with no policies, like every other table (CLAUDE.md).
ALTER TABLE "daftar_entries" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "instapay_link" TEXT;
