-- CreateTable
CREATE TABLE "house_lists" (
    "id" UUID NOT NULL,
    "owner_id" UUID,
    "circle_id" UUID,
    "name" TEXT NOT NULL,
    "place" TEXT NOT NULL DEFAULT 'grocery',
    "trip_user_id" UUID,
    "trip_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_list_items" (
    "id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "qty" TEXT,
    "added_by_id" UUID,
    "done_at" TIMESTAMP(3),
    "done_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "house_lists_owner_id_idx" ON "house_lists"("owner_id");

-- CreateIndex
CREATE INDEX "house_lists_circle_id_idx" ON "house_lists"("circle_id");

-- CreateIndex
CREATE INDEX "house_list_items_list_id_done_at_idx" ON "house_list_items"("list_id", "done_at");

-- AddForeignKey
ALTER TABLE "house_lists" ADD CONSTRAINT "house_lists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_lists" ADD CONSTRAINT "house_lists_trip_user_id_fkey" FOREIGN KEY ("trip_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_lists" ADD CONSTRAINT "house_lists_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_list_items" ADD CONSTRAINT "house_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "house_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_list_items" ADD CONSTRAINT "house_list_items_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_list_items" ADD CONSTRAINT "house_list_items_done_by_id_fkey" FOREIGN KEY ("done_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row level security on, no policies (the API connects as the table owner).
ALTER TABLE "house_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "house_list_items" ENABLE ROW LEVEL SECURITY;
