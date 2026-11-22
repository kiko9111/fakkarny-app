-- CreateTable
CREATE TABLE "session_consents" (
    "user_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "adult" BOOLEAN NOT NULL,
    "consented_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_consents_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "reflect_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "mood" INTEGER NOT NULL,
    "crisis" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "reflect_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflect_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "step_title" TEXT,
    "step_at" TIMESTAMP(3),
    "step_accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reflect_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reflect_sessions_user_id_started_at_idx" ON "reflect_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "reflect_messages_session_id_created_at_idx" ON "reflect_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "session_consents" ADD CONSTRAINT "session_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflect_sessions" ADD CONSTRAINT "reflect_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflect_messages" ADD CONSTRAINT "reflect_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reflect_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security on with no policies, like every other table (CLAUDE.md).
ALTER TABLE "session_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reflect_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reflect_messages" ENABLE ROW LEVEL SECURITY;
