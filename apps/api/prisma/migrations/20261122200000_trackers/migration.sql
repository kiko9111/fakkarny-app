-- CreateTable
CREATE TABLE "trackers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "goal" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trackers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracker_entries" (
    "id" UUID NOT NULL,
    "tracker_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trackers_user_id_idx" ON "trackers"("user_id");

-- CreateIndex
CREATE INDEX "tracker_entries_tracker_id_at_idx" ON "tracker_entries"("tracker_id", "at");

-- AddForeignKey
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_entries" ADD CONSTRAINT "tracker_entries_tracker_id_fkey" FOREIGN KEY ("tracker_id") REFERENCES "trackers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security on with no policies, like every other table (CLAUDE.md).
ALTER TABLE "trackers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tracker_entries" ENABLE ROW LEVEL SECURITY;
