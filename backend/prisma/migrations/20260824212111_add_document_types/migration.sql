-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "soonDays" INTEGER NOT NULL DEFAULT 0,
    "allowOverride" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TruckDocumentStatus" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "lastIssuedAtDate" TIMESTAMP(3),

    CONSTRAINT "TruckDocumentStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TruckDocumentOverride" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "overrideIntervalDays" INTEGER NOT NULL,

    CONSTRAINT "TruckDocumentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLog" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "issuedAtDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "costUah" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "DocumentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_key_key" ON "DocumentType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TruckDocumentStatus_truckId_documentTypeId_key" ON "TruckDocumentStatus"("truckId", "documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "TruckDocumentOverride_truckId_documentTypeId_key" ON "TruckDocumentOverride"("truckId", "documentTypeId");

-- AddForeignKey
ALTER TABLE "TruckDocumentStatus" ADD CONSTRAINT "TruckDocumentStatus_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckDocumentStatus" ADD CONSTRAINT "TruckDocumentStatus_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckDocumentOverride" ADD CONSTRAINT "TruckDocumentOverride_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckDocumentOverride" ADD CONSTRAINT "TruckDocumentOverride_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLog" ADD CONSTRAINT "DocumentLog_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLog" ADD CONSTRAINT "DocumentLog_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
