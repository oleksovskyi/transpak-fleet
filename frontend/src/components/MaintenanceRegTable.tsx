import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMaintenanceTypes } from '../lib/useMaintenanceTypes';
import { useAuth } from '../lib/auth';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import {
  buildMaintenanceItems,
  effectiveParams,
  fmt,
  itemProgressPercent,
  itemRemainingLabel,
  itemStatus,
  statusRank,
  truckMostUrgentItem,
  truckStatus,
  ItemStatus,
} from '../lib/maintenanceStatus';
import { Truck } from '../types';

interface Props {
  trucks: Truck[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}

const FILTER_LABEL: Record<ItemStatus | 'all', string> = {
  all: 'Усі ТЗ',
  overdue: 'Є прострочене',
  soon: 'Є наближене',
  ok: 'Все в нормі',
  unknown: 'Немає даних',
};

const ITEM_BADGE: Record<ItemStatus, string> = {
  unknown: 'badge-gray',
  ok: 'badge-green',
  soon: 'badge-amber',
  overdue: 'badge-red',
};

const ITEM_LABEL: Record<ItemStatus, string> = {
  unknown: 'немає даних',
  ok: 'в нормі',
  soon: 'наближається',
  overdue: 'прострочено',
};

const PROGRESS_COLOR: Record<ItemStatus, string> = {
  unknown: 'var(--gray-300)',
  ok: 'var(--green-600)',
  soon: 'var(--amber-600)',
  overdue: 'var(--red-600)',
};

export default function MaintenanceRegTable({ trucks, loading, error, onChanged }: Props) {
  const { user } = useAuth();
  const { types, loading: typesLoading } = useMaintenanceTypes();
  const [filter, setFilter] = useState<ItemStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [overrideEditKey, setOverrideEditKey] = useState<string | null>(null);
  const [overrideForm, setOverrideForm] = useState({ km: '', days: '' });
  const [overrideSaving, setOverrideSaving] = useState(false);
  const dialog = useDialog();

  function startOverrideEdit(key: string, intervalKm: number | null, intervalDays: number | null) {
    setOverrideEditKey(key);
    setOverrideForm({
      km: intervalKm != null ? String(intervalKm) : '',
      days: intervalDays != null ? String(intervalDays) : '',
    });
  }

  function cancelOverrideEdit() {
    setOverrideEditKey(null);
  }

  async function saveOverride(truckId: string, maintenanceTypeId: string) {
    const km = overrideForm.km === '' ? null : Number(overrideForm.km);
    const days = overrideForm.days === '' ? null : Number(overrideForm.days);
    if (km == null && days == null) {
      dialog.alertMsg('Вкажіть хоча б один інтервал — км або дні.');
      return;
    }
    setOverrideSaving(true);
    try {
      await apiFetch(`/trucks/${truckId}/maintenance-overrides/${maintenanceTypeId}`, {
        method: 'PUT',
        body: JSON.stringify({ overrideIntervalKm: km, overrideIntervalDays: days }),
      });
      setOverrideEditKey(null);
      onChanged();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося зберегти виняток');
    } finally {
      setOverrideSaving(false);
    }
  }

  async function clearOverride(truckId: string, maintenanceTypeId: string) {
    if (!(await dialog.confirm('Скинути індивідуальний виняток і повернутись до загального інтервалу?'))) return;
    setOverrideSaving(true);
    try {
      await apiFetch(`/trucks/${truckId}/maintenance-overrides/${maintenanceTypeId}`, { method: 'DELETE' });
      setOverrideEditKey(null);
      onChanged();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося скинути виняток');
    } finally {
      setOverrideSaving(false);
    }
  }

  function toggle(truckId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(truckId)) next.delete(truckId);
      else next.add(truckId);
      return next;
    });
  }

  async function markDone(truck: Truck, maintenanceTypeId: string) {
    const key = `${truck.id}:${maintenanceTypeId}`;
    setMarkingKey(key);
    try {
      await apiFetch('/maintenance-logs', {
        method: 'POST',
        body: JSON.stringify({ truckId: truck.id, maintenanceTypeId }),
      });
      onChanged();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося позначити виконаним');
    } finally {
      setMarkingKey(null);
    }
  }

  const overdueCount = trucks.filter((t) => truckStatus(t) === 'overdue').length;
  const soonCount = trucks.filter((t) => truckStatus(t) === 'soon').length;
  const inRepairCount = trucks.filter((t) => t.status === 'repair').length;

  const list = trucks
    .filter((t) => filter === 'all' || truckStatus(t) === filter)
    .slice()
    .sort((a, b) => statusRank(truckStatus(b)) - statusRank(truckStatus(a)));

  return (
    <>
      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="mini-stat">
          <div className="l">ТЗ з простроченими позиціями</div>
          <div className="v" style={{ color: 'var(--red-600)' }}>{overdueCount}</div>
        </div>
        <div className="mini-stat">
          <div className="l">ТЗ, де щось наближається</div>
          <div className="v" style={{ color: 'var(--amber-600)' }}>{soonCount}</div>
        </div>
        <div className="mini-stat">
          <div className="l">В ремонті зараз</div>
          <div className="v">{inRepairCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Регламентне обслуговування по ТЗ</div>
            <div className="card-title-sub">кожен вид робіт має власний інтервал — клікніть на рядок, щоб розгорнути</div>
          </div>
          <div className="filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value as ItemStatus | 'all')}>
              {(Object.keys(FILTER_LABEL) as (ItemStatus | 'all')[]).map((k) => (
                <option key={k} value={k}>{FILTER_LABEL[k]}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="empty">{error}</div>}
        {!error && (loading || typesLoading) && <div className="empty">Завантаження…</div>}

        {!error && !loading && !typesLoading && types.length === 0 && (
          <div className="empty">
            Довідник видів ТО ще порожній.
            {user?.role === 'admin' && <> Додайте перший вид робіт у розділі <Link to="/settings">Налаштування</Link>.</>}
          </div>
        )}

        {!error && !loading && !typesLoading && types.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Держ. номер</th>
                  <th>Модель</th>
                  <th>Найтерміновіша позиція</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">Немає ТЗ за обраним фільтром</td>
                  </tr>
                ) : (
                  list.map((t) => {
                    const st = truckStatus(t);
                    const urgent = truckMostUrgentItem(t);
                    const isOpen = expanded.has(t.id);
                    const items = buildMaintenanceItems(t, types);
                    return (
                      <Fragment key={t.id}>
                        <tr className="truck-row" onClick={() => toggle(t.id)}>
                          <td>
                            <button className={`expand-btn${isOpen ? ' open' : ''}`} onClick={(e) => { e.stopPropagation(); toggle(t.id); }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
                            </button>
                          </td>
                          <td><span className="plate">{t.plate}</span></td>
                          <td>{t.model}</td>
                          <td>
                            {urgent ? (
                              <>
                                {effectiveParams(urgent, t).name}{' '}
                                <span style={{ color: 'var(--gray-500)', fontSize: 11.5 }}>({itemRemainingLabel(urgent, t)})</span>
                              </>
                            ) : (
                              <span style={{ color: 'var(--gray-500)' }}>немає виконаних робіт</span>
                            )}
                          </td>
                          <td><span className={`badge ${ITEM_BADGE[st]}`}>{ITEM_LABEL[st]}</span></td>
                        </tr>
                        <tr className={`sub-row${isOpen ? '' : ' closed'}`}>
                          <td colSpan={5}>
                            <table className="sub-table" style={{ tableLayout: 'fixed' }}>
                              <tbody>
                                {items.map((item) => {
                                  const p = effectiveParams(item, t);
                                  const ist = itemStatus(item, t);
                                  const pct = itemProgressPercent(item, t);
                                  const key = `${t.id}:${item.maintenanceTypeId}`;
                                  const intervalLabel = [
                                    p.intervalKm != null ? `${fmt(p.intervalKm)} км` : null,
                                    p.intervalDays != null ? `${p.intervalDays} дн.` : null,
                                  ].filter(Boolean).join(' / ');
                                  return (
                                    <tr key={item.maintenanceTypeId}>
                                      <td style={{ width: '32%' }}>
                                        <span className="sub-item-name">{p.name}</span>
                                        {p.isOverridden && <span className="badge badge-blue" style={{ marginLeft: 6 }}>індивід.</span>}
                                        <div style={{ color: 'var(--gray-500)', fontSize: 11 }}>інтервал: {intervalLabel}</div>
                                        {user?.role === 'admin' && p.allowOverride && (
                                          overrideEditKey === key ? (
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                                              <input
                                                type="number"
                                                placeholder="км"
                                                value={overrideForm.km}
                                                onChange={(e) => setOverrideForm({ ...overrideForm, km: e.target.value })}
                                                style={{ width: 70 }}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                              <input
                                                type="number"
                                                placeholder="дні"
                                                value={overrideForm.days}
                                                onChange={(e) => setOverrideForm({ ...overrideForm, days: e.target.value })}
                                                style={{ width: 60 }}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                              <button
                                                className="btn btn-primary"
                                                style={{ padding: '3px 7px', fontSize: 11 }}
                                                disabled={overrideSaving}
                                                onClick={(e) => { e.stopPropagation(); saveOverride(t.id, item.maintenanceTypeId); }}
                                              >
                                                Зберегти
                                              </button>
                                              {p.isOverridden && (
                                                <button
                                                  className="btn"
                                                  style={{ padding: '3px 7px', fontSize: 11 }}
                                                  disabled={overrideSaving}
                                                  onClick={(e) => { e.stopPropagation(); clearOverride(t.id, item.maintenanceTypeId); }}
                                                >
                                                  Скинути
                                                </button>
                                              )}
                                              <button
                                                className="btn"
                                                style={{ padding: '3px 7px', fontSize: 11 }}
                                                onClick={(e) => { e.stopPropagation(); cancelOverrideEdit(); }}
                                              >
                                                Скасувати
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              className="btn"
                                              style={{ padding: '3px 8px', fontSize: 10.5, marginTop: 4 }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                startOverrideEdit(key, p.intervalKm, p.intervalDays);
                                              }}
                                            >
                                              {p.isOverridden ? 'Змінити виняток' : 'Задати виняток для цього ТЗ'}
                                            </button>
                                          )
                                        )}
                                      </td>
                                      <td style={{ width: '23%' }}>
                                        {pct != null && (
                                          <div className="progress" style={{ width: '70%' }}>
                                            <div style={{ width: `${pct}%`, background: PROGRESS_COLOR[ist] }} />
                                          </div>
                                        )}
                                        <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 3 }}>
                                          {itemRemainingLabel(item, t)}
                                        </div>
                                      </td>
                                      <td style={{ width: '18%' }}>
                                        <span className={`badge ${ITEM_BADGE[ist]}`}>{ITEM_LABEL[ist]}</span>
                                      </td>
                                      <td style={{ width: '27%' }}>
                                        {user?.role === 'admin' && (
                                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                              className="btn"
                                              style={{ padding: '4px 9px', fontSize: 11 }}
                                              disabled={markingKey === key}
                                              onClick={(e) => { e.stopPropagation(); markDone(t, item.maintenanceTypeId); }}
                                            >
                                              {markingKey === key ? 'Збереження…' : 'Позначити виконаним'}
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
