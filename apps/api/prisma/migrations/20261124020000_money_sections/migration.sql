-- CreateTable
CREATE TABLE "money_sections" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "circle_id" UUID,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'expense',
    "budget" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_entries" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "split" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'app',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "money_sections_owner_id_idx" ON "money_sections"("owner_id");

-- CreateIndex
CREATE INDEX "money_sections_circle_id_idx" ON "money_sections"("circle_id");

-- CreateIndex
CREATE INDEX "money_entries_section_id_at_idx" ON "money_entries"("section_id", "at");

-- CreateIndex
CREATE INDEX "money_entries_user_id_idx" ON "money_entries"("user_id");

-- AddForeignKey
ALTER TABLE "money_sections" ADD CONSTRAINT "money_sections_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_sections" ADD CONSTRAINT "money_sections_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "money_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Same rule as every table: RLS on, no policies (the API connects as owner).
ALTER TABLE "money_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_entries" ENABLE ROW LEVEL SECURITY;
