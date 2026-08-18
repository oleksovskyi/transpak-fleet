import { FormEvent, useState } from 'react';
import { useDrivers } from '../lib/useDrivers';
import { useTrucks } from '../lib/useTrucks';
import { useAuth } from '../lib/auth';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import { TRUCK_STATUS_BADGE, TRUCK_STATUS_LABEL } from '../lib/maintenanceStatus';
import { Driver } from '../types';

type NewDriverForm = { fullName: string; experienceYears: string };
const EMPTY_FORM: NewDriverForm = { fullName: '', experienceYears: '' };

export default function DriversPage() {
  const { user } = useAuth();
  const { drivers, loading, error, refetch } = useDrivers();
  const { trucks: allTrucks, refetch: refetchTrucks } = useTrucks();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewDriverForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const dialog = useDialog();

  async function handleReassign(driver: Driver, newTruckId: string) {
    const currentTruckId = driver.trucks[0]?.id ?? null;
    if (newTruckId === currentTruckId || (newTruckId === '' && !currentTruckId)) return;

    let confirmMessage: string;
    if (newTruckId === '') {
      confirmMessage = `Зняти водія "${driver.fullName}" з ТЗ ${driver.trucks[0]?.plate}?`;
    } else {
      const targetTruck = allTrucks.find((t) => t.id === newTruckId);
      confirmMessage = targetTruck?.driver
        ? `ТЗ ${targetTruck.plate} зараз закріплений за "${targetTruck.driver.fullName}". Закріпити замість нього "${driver.fullName}"? "${targetTruck.driver.fullName}" втратить цей ТЗ.`
        : `Закріпити водія "${driver.fullName}" за ТЗ ${targetTruck?.plate}?`;
    }
    if (!(await dialog.confirm(confirmMessage))) return;

    setReassigningId(driver.id);
    try {
      if (newTruckId === '') {
        if (currentTruckId) {
          await apiFetch(`/trucks/${currentTruckId}`, { method: 'PATCH', body: JSON.stringify({ driverId: null }) });
        }
      } else {
        // Бекенд сам знімає водія з попереднього ТЗ, якщо він за кимось уже закріплений —
        // це і є "перепризначення", а не дублювання.
        await apiFetch(`/trucks/${newTruckId}`, { method: 'PATCH', body: JSON.stringify({ driverId: driver.id }) });
      }
      refetch();
      refetchTrucks();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося перепризначити ТЗ');
    } finally {
      setReassigningId(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.fullName.trim()) {
      setFormError("Вкажіть ім'я водія.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/drivers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          experienceYears: form.experienceYears === '' ? null : Number(form.experienceYears),
        }),
      });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Не вдалося додати водія');
    } finally {
      setSaving(false);
    }
  }

  async function removeDriver(driver: Driver) {
    if (!(await dialog.confirm(`Видалити водія "${driver.fullName}"?`, { danger: true, confirmText: 'Видалити' }))) return;
    try {
      await apiFetch(`/drivers/${driver.id}`, { method: 'DELETE' });
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося видалити');
    }
  }

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Водії</div>
          <div className="page-sub">Закріплення водіїв за транспортними засобами</div>
        </div>
        {user?.role === 'admin' && (
          <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Скасувати' : 'Додати водія'}
          </button>
        )}
      </div>

      {user?.role === 'admin' && formOpen && (
        <div className="card">
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {formError && <div className="login-error" style={{ width: '100%' }}>{formError}</div>}
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Ім'я водія</div>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="напр. Олег Ковальчук"
                style={{ width: 220 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Стаж, років</div>
              <input
                type="number"
                value={form.experienceYears}
                onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
                placeholder="необов'язково"
                style={{ width: 140 }}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Збереження…' : 'Зберегти'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-title">Закріплення за ТЗ</div>
        </div>

        {error && <div className="empty">{error}</div>}
        {!error && loading && <div className="empty">Завантаження…</div>}

        {!error && !loading && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Водій</th>
                  <th>Держ. номер</th>
                  <th>Статус ТЗ</th>
                  <th>Стаж</th>
                  {user?.role === 'admin' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">Ще немає жодного водія — додайте першого</td>
                  </tr>
                ) : (
                  drivers.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.fullName}</td>
                      <td>
                        {user?.role === 'admin' ? (
                          <select
                            value={d.trucks[0]?.id ?? ''}
                            disabled={reassigningId === d.id}
                            onChange={(e) => handleReassign(d, e.target.value)}
                          >
                            <option value="">— без ТЗ —</option>
                            {allTrucks.map((t) => {
                              const takenByOther = t.driverId && t.driverId !== d.id;
                              return (
                                <option key={t.id} value={t.id}>
                                  {t.plate}
                                  {takenByOther ? ` (зараз: ${t.driver?.fullName ?? '?'})` : ''}
                                </option>
                              );
                            })}
                          </select>
                        ) : d.trucks.length === 0 ? (
                          <span style={{ color: 'var(--gray-500)' }}>не закріплений</span>
                        ) : (
                          d.trucks.map((t) => (
                            <span className="plate" key={t.id} style={{ marginRight: 6 }}>
                              {t.plate}
                            </span>
                          ))
                        )}
                      </td>
                      <td>
                        {d.trucks.map((t) => (
                          <span key={t.id} className={`badge ${TRUCK_STATUS_BADGE[t.status]}`} style={{ marginRight: 6 }}>
                            {TRUCK_STATUS_LABEL[t.status]}
                          </span>
                        ))}
                      </td>
                      <td>{d.experienceYears != null ? `${d.experienceYears} р.` : '—'}</td>
                      {user?.role === 'admin' && (
                        <td>
                          <button
                            className="btn"
                            style={{ padding: '5px 9px', fontSize: 11, color: 'var(--red-600)' }}
                            onClick={() => removeDriver(d)}
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
        {user?.role === 'admin' && (
          <div className="card-title-sub" style={{ marginTop: 12 }}>
            Перепризначення тут одразу знімає водія з попереднього ТЗ — один водій завжди лише на одному ТЗ.
          </div>
        )}
      </div>
    </section>
  );
}
