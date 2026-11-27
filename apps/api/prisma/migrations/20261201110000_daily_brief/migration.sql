-- AlterTable
ALTER TABLE "users" ADD COLUMN     "brief_time" TEXT,
ADD COLUMN     "brief_topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "brief_digests" (
    "id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "sources" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brief_digests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brief_digests_topic_lang_edition_key" ON "brief_digests"("topic", "lang", "edition");


-- Row level security on, no policies (the API connects as the owner).
ALTER TABLE "brief_digests" ENABLE ROW LEVEL SECURITY;
