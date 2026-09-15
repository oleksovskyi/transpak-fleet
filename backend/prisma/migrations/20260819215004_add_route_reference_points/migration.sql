-- AlterTable
ALTER TABLE "RouteLog" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "Truck" ADD COLUMN     "currentTripDestination" TEXT,
ADD COLUMN     "departureOdometerKm" INTEGER;

-- CreateTable
CREATE TABLE "ReferencePoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferencePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferencePoint_name_key" ON "ReferencePoint"("name");
