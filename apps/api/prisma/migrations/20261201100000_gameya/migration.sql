-- CreateTable
CREATE TABLE "gameyas" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "circle_id" UUID,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "pay_day" INTEGER NOT NULL,
    "start_month" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "web_views" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gameyas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gameya_members" (
    "id" UUID NOT NULL,
    "gameya_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" UUID,
    "turn" INTEGER NOT NULL,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gameya_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gameya_payments" (
    "id" UUID NOT NULL,
    "gameya_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "marked_by" TEXT NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gameya_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gameyas_code_key" ON "gameyas"("code");

-- CreateIndex
CREATE INDEX "gameyas_owner_id_idx" ON "gameyas"("owner_id");

-- CreateIndex
CREATE INDEX "gameyas_circle_id_idx" ON "gameyas"("circle_id");

-- CreateIndex
CREATE INDEX "gameya_members_user_id_idx" ON "gameya_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gameya_members_gameya_id_turn_key" ON "gameya_members"("gameya_id", "turn");

-- CreateIndex
CREATE INDEX "gameya_payments_gameya_id_idx" ON "gameya_payments"("gameya_id");

-- CreateIndex
CREATE UNIQUE INDEX "gameya_payments_member_id_round_key" ON "gameya_payments"("member_id", "round");

-- AddForeignKey
ALTER TABLE "gameyas" ADD CONSTRAINT "gameyas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gameyas" ADD CONSTRAINT "gameyas_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gameya_members" ADD CONSTRAINT "gameya_members_gameya_id_fkey" FOREIGN KEY ("gameya_id") REFERENCES "gameyas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gameya_members" ADD CONSTRAINT "gameya_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gameya_payments" ADD CONSTRAINT "gameya_payments_gameya_id_fkey" FOREIGN KEY ("gameya_id") REFERENCES "gameyas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gameya_payments" ADD CONSTRAINT "gameya_payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "gameya_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security on, no policies (the API connects as the table owner).
ALTER TABLE "gameyas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gameya_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gameya_payments" ENABLE ROW LEVEL SECURITY;
