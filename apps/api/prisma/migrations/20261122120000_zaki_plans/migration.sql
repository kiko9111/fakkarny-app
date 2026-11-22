-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('pro', 'family');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'upsell';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bonus_pro_until" TIMESTAMP(3),
ADD COLUMN     "plan_product_id" TEXT,
ADD COLUMN     "plan_tier" "PlanTier" NOT NULL DEFAULT 'pro',
ADD COLUMN     "referral_code" TEXT,
ADD COLUMN     "referral_rewarded_at" TIMESTAMP(3),
ADD COLUMN     "referred_by_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_referred_by_id_idx" ON "users"("referred_by_id");

