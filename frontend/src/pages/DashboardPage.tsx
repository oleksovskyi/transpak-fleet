import { useTrucks } from '../lib/useTrucks';
import { itemRemainingLabel, effectiveParams, truckMostUrgentItem, truckStatus } from '../lib/maintenanceStatus';
import FleetMap from '../components/FleetMap';
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

  const upcoming = trucks
    .map((t) => ({ truck: t, status: truckStatus(t), item: truckMostUrgentItem(t) }))
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
        </>
      )}
    </section>
  );
}
