-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'viewer');

-- CreateEnum
CREATE TYPE "TruckStatus" AS ENUM ('trip', 'free', 'service', 'repair');

-- CreateEnum
CREATE TYPE "RepairType" AS ENUM ('planned', 'unplanned');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('in_progress', 'done');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "experienceYears" INTEGER,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "TruckStatus" NOT NULL DEFAULT 'free',
    "wialonUnitId" TEXT,
    "totalMileageKm" INTEGER NOT NULL DEFAULT 0,
    "fuelNormL100km" DOUBLE PRECISION,
    "driverId" TEXT,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intervalKm" INTEGER,
    "intervalDays" INTEGER,
    "soonKm" INTEGER NOT NULL DEFAULT 0,
    "soonDays" INTEGER NOT NULL DEFAULT 0,
    "allowOverride" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MaintenanceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TruckMaintenanceStatus" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "maintenanceTypeId" TEXT NOT NULL,
    "lastDoneAtKm" INTEGER,
    "lastDoneAtDate" TIMESTAMP(3),

    CONSTRAINT "TruckMaintenanceStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TruckMaintenanceOverride" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "maintenanceTypeId" TEXT NOT NULL,
    "overrideIntervalKm" INTEGER,
    "overrideIntervalDays" INTEGER,

    CONSTRAINT "TruckMaintenanceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "maintenanceTypeId" TEXT NOT NULL,
    "performedAtKm" INTEGER,
    "performedAtDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "costUah" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "type" "RepairType" NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downtimeDays" INTEGER,
    "costUah" DOUBLE PRECISION,
    "status" "RepairStatus" NOT NULL DEFAULT 'in_progress',

    CONSTRAINT "Repair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MileageLog" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "km" INTEGER NOT NULL,

    CONSTRAINT "MileageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelLog" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "litersPer100km" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteLog" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "distanceKm" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "sentToTelegram" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_plate_key" ON "Truck"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_wialonUnitId_key" ON "Truck"("wialonUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceType_key_key" ON "MaintenanceType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TruckMaintenanceStatus_truckId_maintenanceTypeId_key" ON "TruckMaintenanceStatus"("truckId", "maintenanceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "TruckMaintenanceOverride_truckId_maintenanceTypeId_key" ON "TruckMaintenanceOverride"("truckId", "maintenanceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "MileageLog_truckId_date_key" ON "MileageLog"("truckId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FuelLog_truckId_date_key" ON "FuelLog"("truckId", "date");

-- AddForeignKey
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckMaintenanceStatus" ADD CONSTRAINT "TruckMaintenanceStatus_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckMaintenanceStatus" ADD CONSTRAINT "TruckMaintenanceStatus_maintenanceTypeId_fkey" FOREIGN KEY ("maintenanceTypeId") REFERENCES "MaintenanceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckMaintenanceOverride" ADD CONSTRAINT "TruckMaintenanceOverride_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckMaintenanceOverride" ADD CONSTRAINT "TruckMaintenanceOverride_maintenanceTypeId_fkey" FOREIGN KEY ("maintenanceTypeId") REFERENCES "MaintenanceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_maintenanceTypeId_fkey" FOREIGN KEY ("maintenanceTypeId") REFERENCES "MaintenanceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MileageLog" ADD CONSTRAINT "MileageLog_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteLog" ADD CONSTRAINT "RouteLog_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
