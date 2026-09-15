import { FormEvent, useState } from 'react';
import { useTrucks } from '../lib/useTrucks';
import { useDrivers } from '../lib/useDrivers';
import { useAuth } from '../lib/auth';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import {
  effectiveParams,
  fmt,
  itemRemainingLabel,
  statusRank,
  truckMostUrgentItem,
  truckStatus,
  TRUCK_STATUS_BADGE,
  TRUCK_STATUS_LABEL,
} from '../lib/maintenanceStatus';
import { effectiveDocumentParams, documentItemRemainingLabel, truckMostUrgentDocument, truckDocumentStatus } from '../lib/documentStatus';
import { Truck, TruckStatus } from '../types';

type SortBy = 'id' | 'mileage' | 'to' | 'status';

// Порядок відповідає списку у фільтрі статусів нижче (В рейсі → На базі → На ТО → В ремонті).
const TRUCK_STATUS_RANK: Record<TruckStatus, number> = { trip: 0, free: 1, service: 2, repair: 3 };

type NewTruckForm = {
  plate: string;
  model: string;
  wialonUnitId: string;
};

type EditTruckForm = NewTruckForm & { driverId: string };

const EMPTY_TRUCK_FORM: NewTruckForm = { plate: '', model: '', wialonUnitId: '' };
const EMPTY_EDIT_FORM: EditTruckForm = { ...EMPTY_TRUCK_FORM, driverId: '' };

function toBadge(truck: Truck) {
  const status = truckStatus(truck);
  const item = truckMostUrgentItem(truck);
  if (status === 'unknown' || !item) return <span className="badge badge-gray">немає даних</span>;
  const name = effectiveParams(item, truck).name;
  const badgeClass = status === 'overdue' ? 'badge-red' : status === 'soon' ? 'badge-amber' : 'badge-green';
  return (
    <span className={`badge ${badgeClass}`} title={name}>
      {name}: {itemRemainingLabel(item, truck)}
    </span>
  );
}

function docBadge(truck: Truck) {
  const status = truckDocumentStatus(truck);
  const item = truckMostUrgentDocument(truck);
  if (status === 'unknown' || !item) return <span className="badge badge-gray">немає даних</span>;
  const name = effectiveDocumentParams(item, truck).name;
  const badgeClass = status === 'overdue' ? 'badge-red' : status === 'soon' ? 'badge-amber' : 'badge-green';
  return (
    <span className={`badge ${badgeClass}`} title={name}>
      {name}: {documentItemRemainingLabel(item, truck)}
    </span>
  );
}

export default function FleetPage() {
  const { user } = useAuth();
  const { trucks, loading, error, refetch } = useTrucks();
  const { drivers } = useDrivers();
  const [statusFilter, setStatusFilter] = useState<TruckStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('status');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewTruckForm>(EMPTY_TRUCK_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditTruckForm>(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [mileageEditId, setMileageEditId] = useState<string | null>(null);
  const [mileageValue, setMileageValue] = useState('');
  const [mileageSaving, setMileageSaving] = useState(false);
  const dialog = useDialog();

  function startMileageEdit(t: Truck) {
    setMileageEditId(t.id);
    setMileageValue(String(t.totalMileageKm));
  }

  function cancelMileageEdit() {
    setMileageEditId(null);
  }

  async function saveMileage(t: Truck) {
    const next = Number(mileageValue);
    if (!Number.isFinite(next) || next < 0) {
      dialog.alertMsg('Вкажіть коректний пробіг — невід’ємне число.');
      return;
    }
    const confirmed = await dialog.confirm(
      `Вручну змінити пробіг ${t.plate} з ${fmt(t.totalMileageKm)} км на ${fmt(next)} км?\n\n` +
        'Це ручна корекція, доки Wialon не дає реальних показань одометра. Якщо пізніше ' +
        "з'явиться справжній пробіг з Wialon, він перепише це значення.",
    );
    if (!confirmed) return;
    setMileageSaving(true);
    try {
      await apiFetch(`/trucks/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ totalMileageKm: next }),
      });
      setMileageEditId(null);
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося оновити пробіг');
    } finally {
      setMileageSaving(false);
    }
  }

  function startEdit(t: Truck) {
    setEditingId(t.id);
    setEditForm({
      plate: t.plate,
      model: t.model,
      wialonUnitId: t.wialonUnitId ?? '',
      driverId: t.driverId ?? '',
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editForm.plate.trim() || !editForm.model.trim()) {
      setEditError('Держ. номер і модель не можуть бути порожніми.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await apiFetch(`/trucks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          plate: editForm.plate.trim(),
          model: editForm.model.trim(),
          wialonUnitId: editForm.wialonUnitId.trim() || null,
          driverId: editForm.driverId || null,
        }),
      });
      setEditingId(null);
      refetch();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Не вдалося зберегти зміни');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.plate.trim() || !form.model.trim()) {
      setFormError('Вкажіть держ. номер і модель.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/trucks', {
        method: 'POST',
        body: JSON.stringify({
          plate: form.plate.trim(),
          model: form.model.trim(),
          wialonUnitId: form.wialonUnitId.trim() || null,
        }),
      });
      setForm(EMPTY_TRUCK_FORM);
      setFormOpen(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Не вдалося створити ТЗ');
    } finally {
      setSaving(false);
    }
  }

  let list = trucks.slice();
  if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
  if (sortBy === 'mileage') list.sort((a, b) => b.totalMileageKm - a.totalMileageKm);
  if (sortBy === 'to') list.sort((a, b) => statusRank(truckStatus(b)) - statusRank(truckStatus(a)));
  if (sortBy === 'status') list.sort((a, b) => TRUCK_STATUS_RANK[a.status] - TRUCK_STATUS_RANK[b.status]);
  if (sortBy === 'id') list.sort((a, b) => a.plate.localeCompare(b.plate, 'uk'));

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Автопарк</div>
          <div className="page-sub">Усі транспортні засоби компанії</div>
        </div>
        {user?.role === 'admin' && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? 'Скасувати' : 'Додати ТЗ'}
            </button>
          </div>
        )}
      </div>

      {user?.role === 'admin' && formOpen && (
        <div className="card">
          <form
            onSubmit={handleCreate}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            {formError && <div className="login-error" style={{ width: '100%' }}>{formError}</div>}
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Держ. номер</div>
              <input
                type="text"
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                placeholder="напр. BC 1234 AA"
                style={{ width: 160 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Модель</div>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="напр. MAN TGX 18.480"
                style={{ width: 220 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Wialon unit ID</div>
              <input
                type="text"
                value={form.wialonUnitId}
                onChange={(e) => setForm({ ...form, wialonUnitId: e.target.value })}
                placeholder="необов'язково"
                style={{ width: 160 }}
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
          <div className="filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TruckStatus | 'all')}>
              <option value="all">Усі статуси</option>
              <option value="trip">В рейсі</option>
              <option value="free">На базі</option>
              <option value="service">На ТО</option>
              <option value="repair">В ремонті</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="id">Сортувати за номером</option>
              <option value="mileage">За пробігом</option>
              <option value="status">За статусом</option>
              <option value="to">За «До ТО»</option>
            </select>
          </div>
          <div className="card-title-sub">
            {loading ? '' : `Показано ${list.length} з ${trucks.length}`}
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
                  <th>Модель</th>
                  <th>Статус</th>
                  <th>Водій</th>
                  <th>Загальний пробіг</th>
                  <th>До ТО</th>
                  <th>Документи</th>
                  <th>Wialon ID</th>
                  {user?.role === 'admin' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty">
                      Немає ТЗ за обраним фільтром
                    </td>
                  </tr>
                ) : (
                  list.map((t) =>
                    editingId === t.id ? (
                      <tr key={t.id}>
                        <td>
                          <input
                            type="text"
                            value={editForm.plate}
                            onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })}
                            style={{ width: 120 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editForm.model}
                            onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                            style={{ width: 160 }}
                          />
                        </td>
                        <td><span className={`badge ${TRUCK_STATUS_BADGE[t.status]}`}>{TRUCK_STATUS_LABEL[t.status]}</span></td>
                        <td>
                          <select
                            value={editForm.driverId}
                            onChange={(e) => setEditForm({ ...editForm, driverId: e.target.value })}
                          >
                            <option value="">— без водія —</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.fullName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{fmt(t.totalMileageKm)} км</td>
                        <td>{toBadge(t)}</td>
                        <td>{docBadge(t)}</td>
                        <td>
                          <input
                            type="text"
                            value={editForm.wialonUnitId}
                            onChange={(e) => setEditForm({ ...editForm, wialonUnitId: e.target.value })}
                            style={{ width: 110 }}
                          />
                        </td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '5px 9px', fontSize: 11 }}
                            disabled={editSaving}
                            onClick={() => saveEdit(t.id)}
                          >
                            {editSaving ? '…' : 'Зберегти'}
                          </button>
                          <button className="btn" style={{ padding: '5px 9px', fontSize: 11 }} onClick={cancelEdit}>
                            Скасувати
                          </button>
                          {editError && <div className="login-error" style={{ marginTop: 4 }}>{editError}</div>}
                        </td>
                      </tr>
                    ) : (
                      <tr key={t.id}>
                        <td><span className="plate">{t.plate}</span></td>
                        <td>{t.model}</td>
                        <td><span className={`badge ${TRUCK_STATUS_BADGE[t.status]}`}>{TRUCK_STATUS_LABEL[t.status]}</span></td>
                        <td>{t.driver?.fullName ?? '—'}</td>
                        <td>
                          {user?.role === 'admin' ? (
                            mileageEditId === t.id ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  type="number"
                                  value={mileageValue}
                                  onChange={(e) => setMileageValue(e.target.value)}
                                  style={{ width: 90 }}
                                  autoFocus
                                />
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '3px 7px', fontSize: 11 }}
                                  disabled={mileageSaving}
                                  onClick={() => saveMileage(t)}
                                >
                                  ✓
                                </button>
                                <button
                                  className="btn"
                                  style={{ padding: '3px 7px', fontSize: 11 }}
                                  onClick={cancelMileageEdit}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {fmt(t.totalMileageKm)} км
                                <button
                                  className="btn"
                                  style={{ padding: '2px 6px', fontSize: 10 }}
                                  title="Скоригувати пробіг вручну"
                                  onClick={() => startMileageEdit(t)}
                                >
                                  ✎
                                </button>
                              </span>
                            )
                          ) : (
                            `${fmt(t.totalMileageKm)} км`
                          )}
                        </td>
                        <td>{toBadge(t)}</td>
                        <td>{docBadge(t)}</td>
                        <td>{t.wialonUnitId ?? '—'}</td>
                        {user?.role === 'admin' && (
                          <td>
                            <button className="btn" style={{ padding: '5px 9px', fontSize: 11 }} onClick={() => startEdit(t)}>
                              Редагувати
                            </button>
                          </td>
                        )}
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
