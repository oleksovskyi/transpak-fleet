import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrucks } from '../lib/useTrucks';
import { useMaintenanceTypes } from '../lib/useMaintenanceTypes';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import { buildMaintenanceItems, itemStatus } from '../lib/maintenanceStatus';
import { MaintenanceType, Truck } from '../types';

interface ItemForm {
  km: string;
  date: string;
}

interface RowForm {
  mileage: string;
  items: Record<string, ItemForm>;
}

function buildRow(truck: Truck, types: MaintenanceType[]): RowForm {
  const items: Record<string, ItemForm> = {};
  for (const type of types) {
    const status = truck.maintenanceStatuses.find((s) => s.maintenanceTypeId === type.id);
    items[type.id] = {
      km: status?.lastDoneAtKm != null ? String(status.lastDoneAtKm) : '',
      date: status?.lastDoneAtDate ? status.lastDoneAtDate.slice(0, 10) : '',
    };
  }
  return { mileage: String(truck.totalMileageKm), items };
}

function unknownCount(truck: Truck, types: MaintenanceType[]): number {
  return buildMaintenanceItems(truck, types).filter((item) => itemStatus(item, truck) === 'unknown').length;
}

export default function SetupPage() {
  const { trucks, loading: trucksLoading, error: trucksError, refetch } = useTrucks();
  const { types, loading: typesLoading, error: typesError } = useMaintenanceTypes();
  const dialog = useDialog();

  const [forms, setForms] = useState<Record<string, RowForm>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const initialized = useRef(false);

  const sortedTrucks = useMemo(() => {
    return trucks
      .slice()
      .sort((a, b) => unknownCount(b, types) - unknownCount(a, types) || a.plate.localeCompare(b.plate, 'uk'));
  }, [trucks, types]);

  useEffect(() => {
    if (initialized.current || trucks.length === 0 || types.length === 0) return;
    const next: Record<string, RowForm> = {};
    trucks.forEach((t) => (next[t.id] = buildRow(t, types)));
    setForms(next);
    initialized.current = true;
  }, [trucks, types]);

  function setMileage(truckId: string, value: string) {
    setForms((prev) => ({ ...prev, [truckId]: { ...prev[truckId], mileage: value } }));
  }

  function setItem(truckId: string, typeId: string, patch: Partial<ItemForm>) {
    setForms((prev) => ({
      ...prev,
      [truckId]: {
        ...prev[truckId],
        items: { ...prev[truckId].items, [typeId]: { ...prev[truckId].items[typeId], ...patch } },
      },
    }));
  }

  async function saveRow(truck: Truck) {
    const form = forms[truck.id];
    if (!form) return;
    setSavingId(truck.id);
    try {
      const nextMileage = form.mileage === '' ? null : Number(form.mileage);
      if (nextMileage == null || !Number.isFinite(nextMileage) || nextMileage < 0) {
        dialog.alertMsg('Вкажіть коректний пробіг — невід’ємне число.');
        return;
      }
      if (nextMileage !== truck.totalMileageKm) {
        await apiFetch(`/trucks/${truck.id}`, { method: 'PATCH', body: JSON.stringify({ totalMileageKm: nextMileage }) });
      }

      for (const type of types) {
        const item = form.items[type.id];
        if (!item || item.km === '') continue;
        const km = Number(item.km);
        if (!Number.isFinite(km) || km < 0) {
          dialog.alertMsg(`"${type.name}": пробіг на момент ТО має бути невід’ємним числом.`);
          continue;
        }
        if (km > nextMileage) {
          dialog.alertMsg(`"${type.name}": пробіг на момент ТО (${km}) не може перевищувати пробіг ТЗ (${nextMileage}).`);
          continue;
        }
        await apiFetch('/maintenance-logs', {
          method: 'POST',
          body: JSON.stringify({
            truckId: truck.id,
            maintenanceTypeId: type.id,
            performedAtKm: km,
            performedAtDate: item.date || undefined,
          }),
        });
      }
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося зберегти');
    } finally {
      setSavingId(null);
    }
  }

  const loading = trucksLoading || typesLoading;
  const error = trucksError || typesError;

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Первинне налаштування</div>
          <div className="page-sub">
            Масове внесення реального пробігу і дати/пробігу останнього ТО — щоб система почала рахувати
            залишки самостійно замість "немає даних". ТЗ без жодних даних — зверху.
          </div>
        </div>
      </div>

      {error && <div className="card"><div className="empty">{error}</div></div>}
      {!error && loading && <div className="card"><div className="empty">Завантаження…</div></div>}

      {!error && !loading && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">ТЗ × види робіт</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--white)' }}>ТЗ</th>
                  <th>Пробіг, км</th>
                  {types.map((t) => (
                    <th key={t.id}>
                      {t.name}
                      {t.intervalKm != null && t.intervalDays != null ? ' (км + дата)' : t.intervalDays != null ? ' (дата)' : ''}
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedTrucks.map((truck) => {
                  const form = forms[truck.id];
                  if (!form) return null;
                  return (
                    <tr key={truck.id}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--white)', fontWeight: 600 }}>
                        <span className="plate">{truck.plate}</span>
                        <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 500, marginTop: 2 }}>
                          {truck.model}
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={form.mileage}
                          onChange={(e) => setMileage(truck.id, e.target.value)}
                          style={{ width: 100 }}
                        />
                      </td>
                      {types.map((type) => (
                        <td key={type.id}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {type.intervalKm != null && (
                              <input
                                type="number"
                                placeholder="км"
                                value={form.items[type.id]?.km ?? ''}
                                onChange={(e) => setItem(truck.id, type.id, { km: e.target.value })}
                                style={{ width: 85 }}
                              />
                            )}
                            {type.intervalDays != null && (
                              <input
                                type="date"
                                value={form.items[type.id]?.date ?? ''}
                                onChange={(e) => setItem(truck.id, type.id, { date: e.target.value })}
                                style={{ width: type.intervalKm != null ? 130 : 150 }}
                              />
                            )}
                          </div>
                        </td>
                      ))}
                      <td>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '5px 10px', fontSize: 11.5 }}
                          disabled={savingId === truck.id}
                          onClick={() => saveRow(truck)}
                        >
                          {savingId === truck.id ? 'Зберігаю…' : 'Зберегти'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card-title-sub" style={{ marginTop: 12 }}>
            Порожня клітинка виду робіт при збереженні просто пропускається — можна заповнювати поступово,
            в будь-якому порядку, і повертатись пізніше (напр. для нового ТЗ у флоті).
          </div>
        </div>
      )}
    </section>
  );
}
