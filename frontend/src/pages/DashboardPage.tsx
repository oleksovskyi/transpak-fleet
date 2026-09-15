import { useTrucks } from '../lib/useTrucks';
import { useRepairs } from '../lib/useRepairs';
import { itemRemainingLabel, effectiveParams, truckMostUrgentItem, truckStatus } from '../lib/maintenanceStatus';
import { documentItemRemainingLabel, effectiveDocumentParams, truckMostUrgentDocument, truckDocumentStatus } from '../lib/documentStatus';
import FleetMap from '../components/FleetMap';
import FleetMileageChart from '../components/FleetMileageChart';
import TopRoutesChart from '../components/TopRoutesChart';
import DriverMileageChart from '../components/DriverMileageChart';
import { Truck, TruckStatus } from '../types';

const today = new Date();

function renderKpis(trucks: Truck[]) {
  const counts: Record<TruckStatus, number> = { trip: 0, free: 0, service: 0, repair: 0 };
  trucks.forEach((t) => counts[t.status]++);
  const soonCount = trucks.filter((t) => truckStatus(t) === 'soon').length;
  const total = trucks.length || 1;

  return [
    { label: 'Усього ТЗ', value: trucks.length, dot: 'dot-gray', note: 'у флоті компанії' },
    { label: 'В рейсі', value: counts.trip, dot: 'dot-blue', note: `${Math.round((counts.trip / total) * 100)}% автопарку` },
    { label: 'На базі', value: counts.free, dot: 'dot-green', note: 'готові до рейсу' },
    { label: 'На ТО / в ремонті', value: counts.service + counts.repair, dot: 'dot-amber', note: `${counts.repair} в ремонті` },
    { label: 'ТО наближається', value: soonCount, dot: 'dot-red', note: 'потребують уваги' },
  ];
}

export default function DashboardPage() {
  const { trucks, loading, error } = useTrucks();
  const { repairs, loading: repairsLoading, error: repairsError } = useRepairs();

  const upcoming = trucks
    .map((t) => ({ truck: t, status: truckStatus(t), item: truckMostUrgentItem(t) }))
    .filter((x) => (x.status === 'soon' || x.status === 'overdue') && x.item)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'overdue' ? -1 : 1))
    .slice(0, 6);

  const inRepair = repairs
    .filter((r) => r.status === 'in_progress')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const upcomingDocs = trucks
    .map((t) => ({ truck: t, status: truckDocumentStatus(t), item: truckMostUrgentDocument(t) }))
    .filter((x) => (x.status === 'soon' || x.status === 'overdue') && x.item)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'overdue' ? -1 : 1))
    .slice(0, 6);

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Огляд автопарку</div>
          <div className="page-sub">
            Сьогодні, {today.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {error && <div className="card"><div className="empty">{error}</div></div>}
      {!error && loading && <div className="card"><div className="empty">Завантаження…</div></div>}

      {!error && !loading && (
        <>
          <div className="kpi-grid">
            {renderKpis(trucks).map((k) => (
              <div className="kpi-card" key={k.label}>
                <div className="kpi-label">
                  {k.label}
                  <span className={`kpi-dot ${k.dot}`} />
                </div>
                <div className="kpi-value">{k.value}</div>
                <div className="kpi-delta" style={{ color: 'var(--gray-500)' }}>
                  {k.note}
                </div>
              </div>
            ))}
          </div>

          <FleetMap trucks={trucks} />

          <FleetMileageChart />

          <div className="row-2">
            <TopRoutesChart />
            <DriverMileageChart />
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">ТО, що наближається</div>
            </div>
            {upcoming.length === 0 ? (
              <div className="empty">Усі позиції регламенту в нормі</div>
            ) : (
              upcoming.map(({ truck, status, item }) => (
                <div className="driver-card" key={truck.id}>
                  <div style={{ flex: 1 }}>
                    <div className="driver-name">
                      {truck.plate}{' '}
                      <span style={{ fontWeight: 500, color: 'var(--gray-500)', fontSize: 12 }}>· {truck.model}</span>
                    </div>
                    <div className="driver-meta">
                      {effectiveParams(item!, truck).name}
                      {truck.driver ? ` · водій ${truck.driver.fullName}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>
                    {status === 'overdue' ? 'прострочено' : 'залишилось'} {itemRemainingLabel(item!, truck)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Документи, що спливають</div>
            </div>
            {upcomingDocs.length === 0 ? (
              <div className="empty">Усі документи в нормі</div>
            ) : (
              upcomingDocs.map(({ truck, status, item }) => (
                <div className="driver-card" key={truck.id}>
                  <div style={{ flex: 1 }}>
                    <div className="driver-name">
                      {truck.plate}{' '}
                      <span style={{ fontWeight: 500, color: 'var(--gray-500)', fontSize: 12 }}>· {truck.model}</span>
                    </div>
                    <div className="driver-meta">
                      {effectiveDocumentParams(item!, truck).name}
                      {truck.driver ? ` · водій ${truck.driver.fullName}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>
                    {status === 'overdue' ? 'прострочено' : 'залишилось'} {documentItemRemainingLabel(item!, truck)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">В ремонті</div>
            </div>
            {repairsError && <div className="empty">{repairsError}</div>}
            {!repairsError && repairsLoading && <div className="empty">Завантаження…</div>}
            {!repairsError && !repairsLoading && (
              inRepair.length === 0 ? (
                <div className="empty">Зараз жоден ТЗ не в ремонті</div>
              ) : (
                inRepair.map((r) => (
                  <div className="driver-card" key={r.id}>
                    <div style={{ flex: 1 }}>
                      <div className="driver-name">
                        {r.truck.plate}{' '}
                        <span style={{ fontWeight: 500, color: 'var(--gray-500)', fontSize: 12 }}>· {r.truck.model}</span>
                      </div>
                      <div className="driver-meta">
                        {r.description}
                        {r.downtimeDays != null ? ` · простій ${r.downtimeDays} дн.` : ''}
                        {' · з '}
                        {new Date(r.date).toLocaleDateString('uk-UA')}
                      </div>
                    </div>
                    <span className={`badge ${r.type === 'planned' ? 'badge-blue' : 'badge-red'}`}>
                      {r.type === 'planned' ? 'плановий' : 'позаплановий'}
                    </span>
                  </div>
                ))
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}
