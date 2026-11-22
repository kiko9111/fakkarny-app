-- CreateEnum
CREATE TYPE "CircleKind" AS ENUM ('friends', 'family');

-- CreateEnum
CREATE TYPE "CircleRole" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "circles" (
    "id" UUID NOT NULL,
    "kind" "CircleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_members" (
    "circle_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "CircleRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_members_pkey" PRIMARY KEY ("circle_id","user_id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "circle_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "web_confirms" INTEGER NOT NULL DEFAULT 0,
    "joins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "circle_members_user_id_idx" ON "circle_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_code_key" ON "invites"("code");

-- CreateIndex
CREATE INDEX "invites_circle_id_idx" ON "invites"("circle_id");

-- CreateIndex
CREATE INDEX "invites_inviter_id_idx" ON "invites"("inviter_id");

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security on with no policies, like every other table (CLAUDE.md).
ALTER TABLE "circles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circle_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;
