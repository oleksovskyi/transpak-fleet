import { FormEvent, useMemo, useState } from 'react';
import { useRouteLogs } from '../lib/useRouteLogs';
import { useTrucks } from '../lib/useTrucks';
import { useAuth } from '../lib/auth';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import { fmt } from '../lib/maintenanceStatus';
import { RouteLog } from '../types';

type NewRouteForm = {
  truckId: string;
  fromCity: string;
  toCity: string;
  distanceKm: string;
  date: string;
};

const EMPTY_FORM: NewRouteForm = { truckId: '', fromCity: '', toCity: '', distanceKm: '', date: '' };

type Period = '30' | '90' | 'all';
const PERIOD_LABEL: Record<Period, string> = { '30': '30 днів', '90': '90 днів', all: 'Увесь час' };

interface AggregatedRow {
  key: string;
  plate: string;
  fromCity: string;
  toCity: string;
  trips: number;
  totalDistanceKm: number;
}

function aggregate(logs: RouteLog[]): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const log of logs) {
    const key = `${log.truck.plate}::${log.fromCity}::${log.toCity}`;
    const existing = map.get(key);
    if (existing) {
      existing.trips += 1;
      existing.totalDistanceKm += log.distanceKm;
    } else {
      map.set(key, {
        key,
        plate: log.truck.plate,
        fromCity: log.fromCity,
        toCity: log.toCity,
        trips: 1,
        totalDistanceKm: log.distanceKm,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.trips - a.trips);
}

export default function RoutesPage() {
  const { user } = useAuth();
  const { routeLogs, loading, error, refetch } = useRouteLogs();
  const { trucks } = useTrucks();
  const [period, setPeriod] = useState<Period>('30');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewRouteForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useDialog();

  const filteredLogs = useMemo(() => {
    if (period === 'all') return routeLogs;
    const cutoff = Date.now() - Number(period) * 86400000;
    return routeLogs.filter((l) => new Date(l.date).getTime() >= cutoff);
  }, [routeLogs, period]);

  const aggregated = useMemo(() => aggregate(filteredLogs), [filteredLogs]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.truckId || !form.fromCity.trim() || !form.toCity.trim() || !form.distanceKm) {
      setFormError('Заповніть ТЗ, звідки, куди і відстань.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/route-logs', {
        method: 'POST',
        body: JSON.stringify({
          truckId: form.truckId,
          fromCity: form.fromCity.trim(),
          toCity: form.toCity.trim(),
          distanceKm: Number(form.distanceKm),
          date: form.date || undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Не вдалося додати рейс');
    } finally {
      setSaving(false);
    }
  }

  async function removeLog(log: RouteLog) {
    if (
      !(await dialog.confirm(`Видалити рейс ${log.fromCity} → ${log.toCity} (${log.truck.plate})?`, {
        danger: true,
        confirmText: 'Видалити',
      }))
    )
      return;
    try {
      await apiFetch(`/route-logs/${log.id}`, { method: 'DELETE' });
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося видалити');
    }
  }

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Маршрути</div>
          <div className="page-sub">Аналіз найчастіших напрямків перевезень</div>
        </div>
        {user?.role === 'admin' && (
          <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Скасувати' : 'Додати рейс'}
          </button>
        )}
      </div>

      {user?.role === 'admin' && formOpen && (
        <div className="card">
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {formError && <div className="login-error" style={{ width: '100%' }}>{formError}</div>}
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>ТЗ</div>
              <select value={form.truckId} onChange={(e) => setForm({ ...form, truckId: e.target.value })} style={{ width: 160 }}>
                <option value="">Оберіть ТЗ</option>
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>{t.plate}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Звідки</div>
              <input
                type="text"
                value={form.fromCity}
                onChange={(e) => setForm({ ...form, fromCity: e.target.value })}
                placeholder="напр. Жидачів"
                style={{ width: 150 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Куди</div>
              <input
                type="text"
                value={form.toCity}
                onChange={(e) => setForm({ ...form, toCity: e.target.value })}
                placeholder="напр. Львів"
                style={{ width: 150 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Відстань, км</div>
              <input
                type="number"
                value={form.distanceKm}
                onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                placeholder="напр. 120"
                style={{ width: 120 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Дата</div>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Збереження…' : 'Зберегти'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-title">Найчастіші маршрути</div>
          <div className="filters">
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="empty">{error}</div>}
        {!error && loading && <div className="empty">Завантаження…</div>}

        {!error && !loading && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Держ. номер</th>
                  <th>Маршрут</th>
                  <th>Рейсів</th>
                  <th>Загальна відстань</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">Немає рейсів за обраний період</td>
                  </tr>
                ) : (
                  aggregated.map((row) => (
                    <tr key={row.key}>
                      <td><span className="plate">{row.plate}</span></td>
                      <td>{row.fromCity} → {row.toCity}</td>
                      <td className="route-count">{row.trips}</td>
                      <td>{fmt(row.totalDistanceKm)} км</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Усі рейси</div>
          <div className="card-title-sub">повний журнал — незалежно від фільтра періоду вище</div>
        </div>
        {!error && !loading && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Держ. номер</th>
                  <th>Маршрут</th>
                  <th>Відстань</th>
                  <th>Дата</th>
                  {user?.role === 'admin' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {routeLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">Ще немає жодного зареєстрованого рейсу</td>
                  </tr>
                ) : (
                  routeLogs.map((log) => (
                    <tr key={log.id}>
                      <td><span className="plate">{log.truck.plate}</span></td>
                      <td>{log.fromCity} → {log.toCity}</td>
                      <td>{fmt(log.distanceKm)} км</td>
                      <td>{new Date(log.date).toLocaleDateString('uk-UA')}</td>
                      {user?.role === 'admin' && (
                        <td>
                          <button
                            className="btn"
                            style={{ padding: '5px 9px', fontSize: 11, color: 'var(--red-600)' }}
                            onClick={() => removeLog(log)}
                          >
                            Видалити
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
