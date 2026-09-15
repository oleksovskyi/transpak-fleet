import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrucks } from '../lib/useTrucks';
import { useDocumentTypes } from '../lib/useDocumentTypes';
import { apiFetch, ApiError } from '../lib/api';
import { useDialog } from '../lib/dialog';
import { buildDocumentItems, documentItemStatus } from '../lib/documentStatus';
import { DocumentType, Truck } from '../types';

interface RowForm {
  items: Record<string, string>; // documentTypeId -> дата останнього оформлення (yyyy-mm-dd)
}

function buildRow(truck: Truck, types: DocumentType[]): RowForm {
  const items: Record<string, string> = {};
  for (const type of types) {
    const status = truck.documentStatuses.find((s) => s.documentTypeId === type.id);
    items[type.id] = status?.lastIssuedAtDate ? status.lastIssuedAtDate.slice(0, 10) : '';
  }
  return { items };
}

function unknownCount(truck: Truck, types: DocumentType[]): number {
  return buildDocumentItems(truck, types).filter((item) => documentItemStatus(item, truck) === 'unknown').length;
}

export default function SetupDocumentsPage() {
  const { trucks, loading: trucksLoading, error: trucksError, refetch } = useTrucks();
  const { types, loading: typesLoading, error: typesError } = useDocumentTypes();
  const dialog = useDialog();

  const [forms, setForms] = useState<Record<string, RowForm>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
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

  function setItem(truckId: string, typeId: string, value: string) {
    setForms((prev) => ({
      ...prev,
      [truckId]: { ...prev[truckId], items: { ...prev[truckId].items, [typeId]: value } },
    }));
  }

  // Зберігає один ТЗ, повертає список помилок (порожній масив — все ок), нічого сама не
  // показує й не рефетчить — щоб її можна було безпечно викликати як з одиночної кнопки
  // "Зберегти" в рядку, так і в циклі із загальної кнопки "Зберегти все" без купи модалок.
  async function saveTruck(truck: Truck): Promise<string[]> {
    const form = forms[truck.id];
    if (!form) return [];

    const errors: string[] = [];
    for (const type of types) {
      const date = form.items[type.id];
      if (!date) continue;
      try {
        await apiFetch('/document-logs', {
          method: 'POST',
          body: JSON.stringify({ truckId: truck.id, documentTypeId: type.id, issuedAtDate: date }),
        });
      } catch (err) {
        errors.push(`"${type.name}": ${err instanceof ApiError ? err.message : 'не вдалося зберегти'}`);
      }
    }
    return errors;
  }

  async function saveRow(truck: Truck) {
    setSavingId(truck.id);
    try {
      const errors = await saveTruck(truck);
      refetch();
      if (errors.length > 0) dialog.alertMsg(errors.join('\n'));
    } finally {
      setSavingId(null);
    }
  }

  async function saveAll() {
    setSavingAll(true);
    try {
      const perTruckErrors: string[] = [];
      for (const truck of sortedTrucks) {
        const errors = await saveTruck(truck);
        if (errors.length > 0) perTruckErrors.push(`${truck.plate}: ${errors.join('; ')}`);
      }
      refetch();
      dialog.alertMsg(
        perTruckErrors.length > 0
          ? `Збережено, але є зауваження:\n${perTruckErrors.join('\n')}`
          : `Усі ТЗ (${sortedTrucks.length}) збережено.`,
      );
    } finally {
      setSavingAll(false);
    }
  }

  const loading = trucksLoading || typesLoading;
  const error = trucksError || typesError;

  return (
    <section>
      <div className="topbar">
        <div>
          <div className="page-title">Первинне налаштування документів і дозволів</div>
          <div className="page-sub">
            Масове внесення дати останнього оформлення/продовження документів — щоб система почала рахувати
            залишки самостійно замість "немає даних". ТЗ без жодних даних — зверху.
          </div>
        </div>
        {!loading && !error && sortedTrucks.length > 0 && (
          <button className="btn btn-primary" disabled={savingAll || savingId !== null} onClick={saveAll}>
            {savingAll ? 'Зберігаю все…' : 'Зберегти все'}
          </button>
        )}
      </div>

      {error && <div className="card"><div className="empty">{error}</div></div>}
      {!error && loading && <div className="card"><div className="empty">Завантаження…</div></div>}

      {!error && !loading && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">ТЗ × види документів</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--white)' }}>ТЗ</th>
                  {types.map((t) => (
                    <th key={t.id}>{t.name} (дата)</th>
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
                      {types.map((type) => (
                        <td key={type.id}>
                          <input
                            type="date"
                            value={form.items[type.id] ?? ''}
                            onChange={(e) => setItem(truck.id, type.id, e.target.value)}
                            style={{ width: 150 }}
                          />
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
            Порожня клітинка виду документа при збереженні просто пропускається — можна заповнювати поступово,
            в будь-якому порядку, і повертатись пізніше (напр. для нового ТЗ у флоті).
          </div>
        </div>
      )}
    </section>
  );
}
