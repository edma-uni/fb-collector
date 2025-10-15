-- CreateTable
CREATE TABLE "FacebookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "funnelStage" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacebookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacebookEvent_eventId_key" ON "FacebookEvent"("eventId");

-- CreateIndex
CREATE INDEX "FacebookEvent_timestamp_idx" ON "FacebookEvent"("timestamp");

-- CreateIndex
CREATE INDEX "FacebookEvent_eventType_idx" ON "FacebookEvent"("eventType");
