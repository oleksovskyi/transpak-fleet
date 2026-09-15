-- CreateTable
CREATE TABLE "RouteLogStop" (
    "id" TEXT NOT NULL,
    "routeLogId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RouteLogStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteLogStop_routeLogId_seq_key" ON "RouteLogStop"("routeLogId", "seq");

-- AddForeignKey
ALTER TABLE "RouteLogStop" ADD CONSTRAINT "RouteLogStop_routeLogId_fkey" FOREIGN KEY ("routeLogId") REFERENCES "RouteLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
