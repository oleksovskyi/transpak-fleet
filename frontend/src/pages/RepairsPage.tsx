import { FormEvent, useState } from 'react';
import { useRepairs } from '../lib/useRepairs';
import { useTrucks } from '../lib/useTrucks';
import { useAuth } from '../lib/auth';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import { Repair, RepairType } from '../types';
import MaintenanceRegTable from '../components/MaintenanceRegTable';

type NewRepairForm = {
  truckId: string;
  type: RepairType;
  description: string;
  date: string;
  downtimeDays: string;
  costUah: string;
};

const EMPTY_FORM: NewRepairForm = {
  truckId: '',
  type: 'unplanned',
  description: '',
  date: '',
  downtimeDays: '',
  costUah: '',
};

export default function RepairsPage() {
  const { user } = useAuth();
  const { repairs, loading, error, refetch } = useRepairs();
  const { trucks, loading: trucksLoading, error: trucksError, refetch: refetchTrucks } = useTrucks();
  const [typeFilter, setTypeFilter] = useState<RepairType | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewRepairForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useDialog();

  const list = typeFilter === 'all' ? repairs : repairs.filter((r) => r.type === typeFilter);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.truckId || !form.description.trim()) {
      setFormError('Оберіть ТЗ і вкажіть опис ремонту.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/repairs', {
        method: 'POST',
        body: JSON.stringify({
          truckId: form.truckId,
          type: form.type,
          description: form.description.trim(),
          date: form.date || undefined,
          downtimeDays: form.downtimeDays === '' ? null : Number(form.downtimeDays),
          costUah: form.costUah === '' ? null : Number(form.costUah),
        }),
      });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Не вдалося створити ремонт');
    } finally {
      setSaving(false);
    }
  }

  async function markDone(repair: Repair) {
    try {
      await apiFetch(`/repairs/${repair.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося оновити статус');
    }
  }

  async function removeRepair(repair: Repair) {
    if (!(await dialog.confirm(`Видалити запис про ремонт "${repair.description}"?`, { danger: true, confirmText: 'Видалити' }))) return;
    try {
      await apiFetch(`/repairs/${repair.id}`, { method: 'DELETE' });
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося видалити');
    }
  }

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">ТО і ремонт</div>
          <div className="page-sub">Планове обслуговування та поточні ремонти</div>
        </div>
      </div>

      <MaintenanceRegTable
        trucks={trucks}
        loading={trucksLoading}
        error={trucksError}
        onChanged={refetchTrucks}
      />

      {user?.role === 'admin' && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Ремонти</div>
            <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? 'Скасувати' : 'Додати ремонт'}
            </button>
          </div>

          {formOpen && (
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {formError && <div className="login-error" style={{ width: '100%' }}>{formError}</div>}
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>ТЗ</div>
                <select value={form.truckId} onChange={(e) => setForm({ ...form, truckId: e.target.value })} style={{ width: 180 }}>
                  <option value="">Оберіть ТЗ</option>
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.plate} · {t.model}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Тип</div>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RepairType })} style={{ width: 130 }}>
                  <option value="unplanned">Позаплановий</option>
                  <option value="planned">Плановий</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Опис</div>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="напр. Заміна гальмівних дисків"
                  style={{ width: 240 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Дата</div>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Простій, днів</div>
                <input
                  type="number"
                  value={form.downtimeDays}
                  onChange={(e) => setForm({ ...form, downtimeDays: e.target.value })}
                  placeholder="необов'язково"
                  style={{ width: 130 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Вартість, грн</div>
                <input
                  type="number"
                  value={form.costUah}
                  onChange={(e) => setForm({ ...form, costUah: e.target.value })}
                  placeholder="необов'язково"
                  style={{ width: 130 }}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Збереження…' : 'Зберегти'}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          {user?.role !== 'admin' && <div className="card-title">Ремонти</div>}
          <div className="filters">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as RepairType | 'all')}>
              <option value="all">Усі</option>
              <option value="planned">Планові</option>
              <option value="unplanned">Позапланові</option>
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
                  <th>Модель</th>
                  <th>Тип</th>
                  <th>Опис</th>
                  <th>Дата</th>
                  <th>Простій</th>
                  <th>Статус</th>
                  {user?.role === 'admin' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty">Немає записів за обраним фільтром</td>
                  </tr>
                ) : (
                  list.map((r) => (
                    <tr key={r.id}>
                      <td><span className="plate">{r.truck.plate}</span></td>
                      <td>{r.truck.model}</td>
                      <td>
                        <span className={`badge ${r.type === 'planned' ? 'badge-blue' : 'badge-red'}`}>
                          {r.type === 'planned' ? 'плановий' : 'позаплановий'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'normal' }}>{r.description}</td>
                      <td>{new Date(r.date).toLocaleDateString('uk-UA')}</td>
                      <td>{r.downtimeDays != null ? `${r.downtimeDays} дн.` : '—'}</td>
                      <td>
                        <span className={`badge ${r.status === 'in_progress' ? 'badge-amber' : 'badge-green'}`}>
                          {r.status === 'in_progress' ? 'триває' : 'завершено'}
                        </span>
                      </td>
                      {user?.role === 'admin' && (
                        <td style={{ display: 'flex', gap: 6 }}>
                          {r.status === 'in_progress' && (
                            <button className="btn" style={{ padding: '5px 9px', fontSize: 11 }} onClick={() => markDone(r)}>
                              Завершити
                            </button>
                          )}
                          <button
                            className="btn"
                            style={{ padding: '5px 9px', fontSize: 11, color: 'var(--red-600)' }}
                            onClick={() => removeRepair(r)}
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
