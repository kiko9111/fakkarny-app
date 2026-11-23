-- CreateTable
CREATE TABLE "splits" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "bill" DECIMAL(12,2),
    "service_pct" DECIMAL(5,2) NOT NULL,
    "vat_pct" DECIMAL(5,2) NOT NULL,
    "vat_on_service" BOOLEAN NOT NULL DEFAULT true,
    "tip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "people_json" JSONB NOT NULL,
    "items_json" JSONB NOT NULL DEFAULT '[]',
    "web_adds" INTEGER NOT NULL DEFAULT 0,
    "paid_by" INTEGER,
    "web_views" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "splits_code_key" ON "splits"("code");

-- CreateIndex
CREATE INDEX "splits_user_id_created_at_idx" ON "splits"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "splits" ADD CONSTRAINT "splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- No policies: the API connects as the table owner; the public Data API gets nothing.
ALTER TABLE "splits" ENABLE ROW LEVEL SECURITY;
