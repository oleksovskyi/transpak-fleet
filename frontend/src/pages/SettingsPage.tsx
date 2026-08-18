import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import { MaintenanceType } from '../types';

type NewTypeForm = {
  name: string;
  intervalKm: string;
  intervalDays: string;
  soonKm: string;
  soonDays: string;
  allowOverride: boolean;
};

const EMPTY_FORM: NewTypeForm = {
  name: '',
  intervalKm: '',
  intervalDays: '',
  soonKm: '',
  soonDays: '',
  allowOverride: true,
};

export default function SettingsPage() {
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewTypeForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const dialog = useDialog();

  function load() {
    setLoading(true);
    apiFetch<MaintenanceType[]>('/maintenance-types')
      .then(setTypes)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не вдалося завантажити довідник'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function updateField(type: MaintenanceType, patch: Partial<MaintenanceType>) {
    const updated = await apiFetch<MaintenanceType>(`/maintenance-types/${type.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setTypes((prev) => prev.map((t) => (t.id === type.id ? updated : t)));
  }

  async function removeType(type: MaintenanceType) {
    if (!(await dialog.confirm(`Видалити вид робіт "${type.name}"?`, { danger: true, confirmText: 'Видалити' }))) return;
    try {
      await apiFetch(`/maintenance-types/${type.id}`, { method: 'DELETE' });
      setTypes((prev) => prev.filter((t) => t.id !== type.id));
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося видалити');
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || (form.intervalKm === '' && form.intervalDays === '')) {
      setFormError('Вкажіть назву і хоча б один інтервал (км або дні).');
      return;
    }
    try {
      const created = await apiFetch<MaintenanceType>('/maintenance-types', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          intervalKm: form.intervalKm === '' ? null : Number(form.intervalKm),
          intervalDays: form.intervalDays === '' ? null : Number(form.intervalDays),
          soonKm: form.soonKm === '' ? 0 : Number(form.soonKm),
          soonDays: form.soonDays === '' ? 0 : Number(form.soonDays),
          allowOverride: form.allowOverride,
        }),
      });
      setTypes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'uk')));
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Не вдалося створити');
    }
  }

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Налаштування</div>
          <div className="page-sub">Довідник видів технічного обслуговування — доступно лише адміністратору</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Види регламентних робіт</div>
            <div className="card-title-sub">
              інтервал задається в км і/або днях; якщо задано обидва — статус визначає той, що настане раніше
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Скасувати' : 'Додати вид робіт'}
          </button>
        </div>

        {formOpen && (
          <form
            onSubmit={handleCreate}
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              background: 'var(--gray-50)',
              border: '1px solid var(--gray-200)',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            {formError && <div className="login-error" style={{ width: '100%' }}>{formError}</div>}
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Назва</div>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="напр. Охолоджувальна рідина"
                style={{ width: 200 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Інтервал, км</div>
              <input
                type="number"
                value={form.intervalKm}
                onChange={(e) => setForm({ ...form, intervalKm: e.target.value })}
                placeholder="напр. 60000"
                style={{ width: 110 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Інтервал, дні</div>
              <input
                type="number"
                value={form.intervalDays}
                onChange={(e) => setForm({ ...form, intervalDays: e.target.value })}
                placeholder="необов'язково"
                style={{ width: 110 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Поріг «наближається», км</div>
              <input
                type="number"
                value={form.soonKm}
                onChange={(e) => setForm({ ...form, soonKm: e.target.value })}
                placeholder="0"
                style={{ width: 110 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Поріг «наближається», дні</div>
              <input
                type="number"
                value={form.soonDays}
                onChange={(e) => setForm({ ...form, soonDays: e.target.value })}
                placeholder="0"
                style={{ width: 110 }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-700)', paddingBottom: 8 }}>
              <input
                type="checkbox"
                checked={form.allowOverride}
                onChange={(e) => setForm({ ...form, allowOverride: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Дозволити виняток по ТЗ
            </label>
            <button className="btn btn-primary" type="submit">Зберегти</button>
          </form>
        )}

        {error && <div className="empty">{error}</div>}
        {!error && loading && <div className="empty">Завантаження…</div>}

        {!error && !loading && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Інтервал, км</th>
                  <th>Інтервал, дні</th>
                  <th>Поріг «наближається»</th>
                  <th>Виняток по ТЗ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {types.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">Довідник ще порожній — додайте перший вид робіт</td>
                  </tr>
                ) : (
                  types.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td>
                        <input
                          type="number"
                          defaultValue={t.intervalKm ?? ''}
                          placeholder="—"
                          style={{ width: 100 }}
                          onBlur={(e) =>
                            updateField(t, { intervalKm: e.target.value === '' ? null : Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          defaultValue={t.intervalDays ?? ''}
                          placeholder="—"
                          style={{ width: 90 }}
                          onBlur={(e) =>
                            updateField(t, { intervalDays: e.target.value === '' ? null : Number(e.target.value) })
                          }
                        />
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {t.intervalKm != null && (
                          <input
                            type="number"
                            defaultValue={t.soonKm}
                            style={{ width: 70, marginRight: 4 }}
                            onBlur={(e) => updateField(t, { soonKm: Number(e.target.value) || 0 })}
                          />
                        )}
                        {t.intervalKm != null && 'км '}
                        {t.intervalDays != null && (
                          <input
                            type="number"
                            defaultValue={t.soonDays}
                            style={{ width: 60, marginRight: 4 }}
                            onBlur={(e) => updateField(t, { soonDays: Number(e.target.value) || 0 })}
                          />
                        )}
                        {t.intervalDays != null && 'дн.'}
                      </td>
                      <td>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            defaultChecked={t.allowOverride}
                            style={{ width: 'auto' }}
                            onChange={(e) => updateField(t, { allowOverride: e.target.checked })}
                          />
                          дозволено
                        </label>
                      </td>
                      <td>
                        <button
                          className="btn"
                          style={{ padding: '5px 9px', fontSize: 11, color: 'var(--red-600)' }}
                          onClick={() => removeType(t)}
                        >
                          Видалити
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-title-sub" style={{ marginTop: 12 }}>
          Зміна інтервалу тут одразу впливає на розрахунок статусів ТЗ на Дашборді й в Автопарку.
        </div>
      </div>
    </section>
  );
}
