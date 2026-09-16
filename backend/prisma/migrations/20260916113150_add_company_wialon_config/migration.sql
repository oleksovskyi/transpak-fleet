-- CreateTable
CREATE TABLE "CompanyWialonConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "wialonToken" TEXT NOT NULL,
    "wialonBaseUrl" TEXT,
    "depotLat" DOUBLE PRECISION NOT NULL,
    "depotLon" DOUBLE PRECISION NOT NULL,
    "depotRadiusKm" DOUBLE PRECISION NOT NULL,
    "depotName" TEXT NOT NULL,
    "wialonReportResourceId" INTEGER NOT NULL,
    "wialonReportTemplateId" INTEGER NOT NULL,
    "wialonDriversResourceId" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyWialonConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyWialonConfig_companyId_key" ON "CompanyWialonConfig"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyWialonConfig" ADD CONSTRAINT "CompanyWialonConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
