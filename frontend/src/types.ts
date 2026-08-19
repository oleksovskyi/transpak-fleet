export type Role = 'admin' | 'viewer';
export type TruckStatus = 'trip' | 'free' | 'service' | 'repair';
export type RepairType = 'planned' | 'unplanned';
export type RepairStatus = 'in_progress' | 'done';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Driver {
  id: string;
  fullName: string;
  experienceYears: number | null;
  trucks: Pick<Truck, 'id' | 'plate' | 'status'>[];
}

export interface MaintenanceType {
  id: string;
  key: string;
  name: string;
  intervalKm: number | null;
  intervalDays: number | null;
  soonKm: number;
  soonDays: number;
  allowOverride: boolean;
}

export interface TruckMaintenanceStatus {
  id: string;
  maintenanceTypeId: string;
  maintenanceType: MaintenanceType;
  lastDoneAtKm: number | null;
  lastDoneAtDate: string | null;
}

export interface TruckMaintenanceOverride {
  id: string;
  maintenanceTypeId: string;
  maintenanceType: MaintenanceType;
  overrideIntervalKm: number | null;
  overrideIntervalDays: number | null;
}

export interface Repair {
  id: string;
  truckId: string;
  truck: Pick<Truck, 'id' | 'plate' | 'model'>;
  type: RepairType;
  description: string;
  date: string;
  downtimeDays: number | null;
  costUah: number | null;
  status: RepairStatus;
}

export interface RouteLog {
  id: string;
  truckId: string;
  truck: Pick<Truck, 'id' | 'plate' | 'model'>;
  fromCity: string;
  toCity: string;
  distanceKm: number;
  date: string;
}

export interface Truck {
  id: string;
  plate: string;
  model: string;
  status: TruckStatus;
  wialonUnitId: string | null;
  totalMileageKm: number;
  lat: number | null;
  lon: number | null;
  positionUpdatedAt: string | null;
  fuelNormL100km: number | null;
  driverId: string | null;
  driver: Driver | null;
  maintenanceStatuses: TruckMaintenanceStatus[];
  overrides: TruckMaintenanceOverride[];
}
