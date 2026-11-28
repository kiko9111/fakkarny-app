-- CreateTable
CREATE TABLE "care_meds" (
    "id" UUID NOT NULL,
    "circle_id" UUID NOT NULL,
    "created_by_id" UUID,
    "person_name" TEXT NOT NULL,
    "person_user_id" UUID,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "times" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "time_zone" TEXT NOT NULL,
    "remind_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "missed_after_minutes" INTEGER NOT NULL DEFAULT 60,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_meds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_doses" (
    "id" UUID NOT NULL,
    "med_id" UUID NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "by_user_id" UUID,
    "marked_at" TIMESTAMP(3),
    "reminded_at" TIMESTAMP(3),
    "alerted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_doses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_meds_circle_id_idx" ON "care_meds"("circle_id");

-- CreateIndex
CREATE INDEX "care_meds_active_idx" ON "care_meds"("active");

-- CreateIndex
CREATE UNIQUE INDEX "care_doses_med_id_due_at_key" ON "care_doses"("med_id", "due_at");

-- AddForeignKey
ALTER TABLE "care_meds" ADD CONSTRAINT "care_meds_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_meds" ADD CONSTRAINT "care_meds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_meds" ADD CONSTRAINT "care_meds_person_user_id_fkey" FOREIGN KEY ("person_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_doses" ADD CONSTRAINT "care_doses_med_id_fkey" FOREIGN KEY ("med_id") REFERENCES "care_meds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_doses" ADD CONSTRAINT "care_doses_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row level security on, no policies (the API connects as the table owner).
ALTER TABLE "care_meds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_doses" ENABLE ROW LEVEL SECURITY;
