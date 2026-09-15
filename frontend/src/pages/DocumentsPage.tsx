import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTrucks } from '../lib/useTrucks';
import { useDocumentTypes } from '../lib/useDocumentTypes';
import { useAuth } from '../lib/auth';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import {
  buildDocumentItems,
  effectiveDocumentParams,
  documentItemProgressPercent,
  documentItemRemainingLabel,
  documentItemStatus,
  documentStatusRank,
  truckMostUrgentDocument,
  truckDocumentStatus,
  DocumentItemStatus,
} from '../lib/documentStatus';

const FILTER_LABEL: Record<DocumentItemStatus | 'all', string> = {
  all: 'Усі ТЗ',
  overdue: 'Є прострочене',
  soon: 'Є наближене',
  ok: 'Все в нормі',
  unknown: 'Немає даних',
};

const ITEM_BADGE: Record<DocumentItemStatus, string> = {
  unknown: 'badge-gray',
  ok: 'badge-green',
  soon: 'badge-amber',
  overdue: 'badge-red',
};

const ITEM_LABEL: Record<DocumentItemStatus, string> = {
  unknown: 'немає даних',
  ok: 'в нормі',
  soon: 'наближається',
  overdue: 'прострочено',
};

const PROGRESS_COLOR: Record<DocumentItemStatus, string> = {
  unknown: 'var(--gray-300)',
  ok: 'var(--green-600)',
  soon: 'var(--amber-600)',
  overdue: 'var(--red-600)',
};

export default function DocumentsPage() {
  const { user } = useAuth();
  const { trucks, loading, error, refetch } = useTrucks();
  const { types, loading: typesLoading } = useDocumentTypes();
  const [filter, setFilter] = useState<DocumentItemStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [overrideEditKey, setOverrideEditKey] = useState<string | null>(null);
  const [overrideDays, setOverrideDays] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);
  const dialog = useDialog();

  function startOverrideEdit(key: string, intervalDays: number) {
    setOverrideEditKey(key);
    setOverrideDays(String(intervalDays));
  }

  function cancelOverrideEdit() {
    setOverrideEditKey(null);
  }

  async function saveOverride(truckId: string, documentTypeId: string) {
    const days = overrideDays === '' ? null : Number(overrideDays);
    if (days == null || days <= 0) {
      dialog.alertMsg('Вкажіть термін дії, днів.');
      return;
    }
    setOverrideSaving(true);
    try {
      await apiFetch(`/trucks/${truckId}/document-overrides/${documentTypeId}`, {
        method: 'PUT',
        body: JSON.stringify({ overrideIntervalDays: days }),
      });
      setOverrideEditKey(null);
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося зберегти виняток');
    } finally {
      setOverrideSaving(false);
    }
  }

  async function clearOverride(truckId: string, documentTypeId: string) {
    if (!(await dialog.confirm('Скинути індивідуальний виняток і повернутись до загального терміну дії?'))) return;
    setOverrideSaving(true);
    try {
      await apiFetch(`/trucks/${truckId}/document-overrides/${documentTypeId}`, { method: 'DELETE' });
      setOverrideEditKey(null);
      refetch();
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

  async function markIssued(truckId: string, documentTypeId: string) {
    const key = `${truckId}:${documentTypeId}`;
    setMarkingKey(key);
    try {
      await apiFetch('/document-logs', {
        method: 'POST',
        body: JSON.stringify({ truckId, documentTypeId }),
      });
      refetch();
    } catch (err) {
      dialog.alertMsg(err instanceof ApiError ? err.message : 'Не вдалося позначити оформленим');
    } finally {
      setMarkingKey(null);
    }
  }

  const overdueCount = trucks.filter((t) => truckDocumentStatus(t) === 'overdue').length;
  const soonCount = trucks.filter((t) => truckDocumentStatus(t) === 'soon').length;

  const list = trucks
    .filter((t) => filter === 'all' || truckDocumentStatus(t) === filter)
    .slice()
    .sort((a, b) => documentStatusRank(truckDocumentStatus(b)) - documentStatusRank(truckDocumentStatus(a)));

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Документи й дозволи</div>
          <div className="page-sub">Страховка, техогляд та інші документи — термін дії по кожному ТЗ</div>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="mini-stat">
          <div className="l">ТЗ з простроченими документами</div>
          <div className="v" style={{ color: 'var(--red-600)' }}>{overdueCount}</div>
        </div>
        <div className="mini-stat">
          <div className="l">ТЗ, де щось наближається</div>
          <div className="v" style={{ color: 'var(--amber-600)' }}>{soonCount}</div>
        </div>
        <div className="mini-stat">
          <div className="l">Усього ТЗ</div>
          <div className="v">{trucks.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Документи по ТЗ</div>
            <div className="card-title-sub">кожен вид документа має власний термін дії — клікніть на рядок, щоб розгорнути</div>
          </div>
          <div className="filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value as DocumentItemStatus | 'all')}>
              {(Object.keys(FILTER_LABEL) as (DocumentItemStatus | 'all')[]).map((k) => (
                <option key={k} value={k}>{FILTER_LABEL[k]}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="empty">{error}</div>}
        {!error && (loading || typesLoading) && <div className="empty">Завантаження…</div>}

        {!error && !loading && !typesLoading && types.length === 0 && (
          <div className="empty">
            Довідник видів документів ще порожній.
            {user?.role === 'admin' && <> Додайте перший вид документа у розділі <Link to="/settings">Налаштування</Link>.</>}
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
                    const st = truckDocumentStatus(t);
                    const urgent = truckMostUrgentDocument(t);
                    const isOpen = expanded.has(t.id);
                    const items = buildDocumentItems(t, types);
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
                                {effectiveDocumentParams(urgent, t).name}{' '}
                                <span style={{ color: 'var(--gray-500)', fontSize: 11.5 }}>({documentItemRemainingLabel(urgent, t)})</span>
                              </>
                            ) : (
                              <span style={{ color: 'var(--gray-500)' }}>немає оформлених документів</span>
                            )}
                          </td>
                          <td><span className={`badge ${ITEM_BADGE[st]}`}>{ITEM_LABEL[st]}</span></td>
                        </tr>
                        <tr className={`sub-row${isOpen ? '' : ' closed'}`}>
                          <td colSpan={5}>
                            <table className="sub-table" style={{ tableLayout: 'fixed' }}>
                              <tbody>
                                {items.map((item) => {
                                  const p = effectiveDocumentParams(item, t);
                                  const ist = documentItemStatus(item, t);
                                  const pct = documentItemProgressPercent(item, t);
                                  const key = `${t.id}:${item.documentTypeId}`;
                                  return (
                                    <tr key={item.documentTypeId}>
                                      <td style={{ width: '32%' }}>
                                        <span className="sub-item-name">{p.name}</span>
                                        {p.isOverridden && <span className="badge badge-blue" style={{ marginLeft: 6 }}>індивід.</span>}
                                        <div style={{ color: 'var(--gray-500)', fontSize: 11 }}>термін дії: {p.intervalDays} дн.</div>
                                        {user?.role === 'admin' && p.allowOverride && (
                                          overrideEditKey === key ? (
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                                              <input
                                                type="number"
                                                placeholder="дні"
                                                value={overrideDays}
                                                onChange={(e) => setOverrideDays(e.target.value)}
                                                style={{ width: 70 }}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                              <button
                                                className="btn btn-primary"
                                                style={{ padding: '3px 7px', fontSize: 11 }}
                                                disabled={overrideSaving}
                                                onClick={(e) => { e.stopPropagation(); saveOverride(t.id, item.documentTypeId); }}
                                              >
                                                Зберегти
                                              </button>
                                              {p.isOverridden && (
                                                <button
                                                  className="btn"
                                                  style={{ padding: '3px 7px', fontSize: 11 }}
                                                  disabled={overrideSaving}
                                                  onClick={(e) => { e.stopPropagation(); clearOverride(t.id, item.documentTypeId); }}
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
                                                startOverrideEdit(key, p.intervalDays);
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
                                          {documentItemRemainingLabel(item, t)}
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
                                              onClick={(e) => { e.stopPropagation(); markIssued(t.id, item.documentTypeId); }}
                                            >
                                              {markingKey === key ? 'Збереження…' : 'Оформлено/продовжено'}
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
    </section>
  );
}
