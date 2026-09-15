-- DropForeignKey
ALTER TABLE "FuelLog" DROP CONSTRAINT "FuelLog_truckId_fkey";

-- AlterTable
ALTER TABLE "Truck" DROP COLUMN "fuelNormL100km";

-- DropTable
DROP TABLE "FuelLog";
