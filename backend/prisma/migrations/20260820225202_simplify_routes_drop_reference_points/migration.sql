-- AlterTable
ALTER TABLE "Truck" DROP COLUMN "currentTripDestination",
DROP COLUMN "departureAt",
DROP COLUMN "departureOdometerKm",
DROP COLUMN "tripFarLat",
DROP COLUMN "tripFarLon";

-- DropTable
DROP TABLE "ReferencePoint";
