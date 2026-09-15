-- Мультитенантність: кожен клієнт платформи (Company) бачить лише свої дані.
-- Існуючі дані Transpak переносяться в один Company-рядок з фіксованим id,
-- щоб на нього можна було послатись із коду бекенду (сідер/скрипт міграції даних).

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Company" ("id", "name") VALUES ('00000000-0000-0000-0000-000000000001', 'Transpak');

-- User: додаємо companyId з backfill на існуючий Transpak-рядок
ALTER TABLE "User" ADD COLUMN "companyId" TEXT;
UPDATE "User" SET "companyId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Driver
ALTER TABLE "Driver" ADD COLUMN "companyId" TEXT;
UPDATE "Driver" SET "companyId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Driver" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Truck: plate і wialonUnitId були унікальні глобально, стають унікальні в межах компанії
ALTER TABLE "Truck" ADD COLUMN "companyId" TEXT;
UPDATE "Truck" SET "companyId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Truck" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Truck" ADD CONSTRAINT "Truck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "Truck_plate_key";
DROP INDEX "Truck_wialonUnitId_key";
CREATE UNIQUE INDEX "Truck_companyId_plate_key" ON "Truck"("companyId", "plate");
CREATE UNIQUE INDEX "Truck_companyId_wialonUnitId_key" ON "Truck"("companyId", "wialonUnitId");

-- MaintenanceType: key був унікальний глобально, стає унікальний в межах компанії
ALTER TABLE "MaintenanceType" ADD COLUMN "companyId" TEXT;
UPDATE "MaintenanceType" SET "companyId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "MaintenanceType" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "MaintenanceType" ADD CONSTRAINT "MaintenanceType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "MaintenanceType_key_key";
CREATE UNIQUE INDEX "MaintenanceType_companyId_key_key" ON "MaintenanceType"("companyId", "key");

-- DocumentType: key був унікальний глобально, стає унікальний в межах компанії
ALTER TABLE "DocumentType" ADD COLUMN "companyId" TEXT;
UPDATE "DocumentType" SET "companyId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "DocumentType" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "DocumentType_key_key";
CREATE UNIQUE INDEX "DocumentType_companyId_key_key" ON "DocumentType"("companyId", "key");
