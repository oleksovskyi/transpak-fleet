import { Fragment, FormEvent, useEffect, useState } from 'react';
import {
  getPlatformKey,
  PlatformApiError,
  PlatformCompany,
  platformFetch,
  PlatformUser,
  setPlatformKey,
  WialonConfig,
} from '../lib/platformApi';

const fieldLabel: React.CSSProperties = { fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 };
const formRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  background: 'var(--gray-50)',
  border: '1px solid var(--gray-200)',
  borderRadius: 8,
  padding: '12px 14px',
  marginTop: 10,
};

// Ключ платформи вводиться раз і живе в localStorage — сторінка сама перевіряє його,
// пробуючи завантажити список компаній; недійсний ключ (401) повертає на форму вводу.
function PlatformKeyGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setPlatformKey(key.trim());
      await platformFetch<PlatformCompany[]>('/companies');
      onUnlocked();
    } catch (err) {
      setPlatformKey(null);
      setError(err instanceof PlatformApiError && err.status === 401 ? 'Недійсний платформний ключ' : 'Не вдалося з’єднатись');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">TP</div>
          <div>
            <div className="brand-name">Платформа</div>
            <div className="brand-sub">Онбординг клієнтів</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} autoComplete="off">
          {error && <div className="login-error">{error}</div>}
          <div className="login-field">
            <label htmlFor="platform-key">Платформний ключ (X-Platform-Key)</label>
            <input
              id="platform-key"
              name="platform-admin-key"
              type="password"
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !key.trim()}>
            {loading ? 'Перевірка…' : 'Увійти'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Повторне введення платформного ключа перед видаленням — навмисно окремо від того, що
// вже збережений у localStorage: захист від випадкового кліку, не від відсутності ключа.
// Реальна перевірка все одно на бекенді (requirePlatformAdmin) — тут лише UX-запобіжник.
function DeleteCompanyModal({
  company,
  onClose,
  onDeleted,
}: {
  company: PlatformCompany;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/platform/companies/${company.id}`, {
        method: 'DELETE',
        headers: { 'X-Platform-Key': key },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Помилка запиту (${res.status})`);
      }
      onDeleted(company.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося видалити компанію');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Видалити компанію «{company.name}»?</div>
        <div className="dialog-message">
          Дію не можна скасувати. Введіть платформний ключ (X-Platform-Key), щоб підтвердити.
        </div>
        <form onSubmit={handleDelete}>
          {error && <div className="login-error" style={{ marginTop: 10 }}>{error}</div>}
          <input
            type="password"
            name="confirm-delete-platform-key"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Платформний ключ"
            autoFocus
            style={{ marginTop: 10, width: '100%' }}
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Скасувати</button>
            <button type="submit" className="btn btn-danger" disabled={deleting || !key.trim()}>
              {deleting ? 'Видалення…' : 'Видалити'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type UserForm = { email: string; password: string; role: 'admin' | 'viewer' };
const EMPTY_USER_FORM: UserForm = { email: '', password: '', role: 'admin' };

type WialonForm = {
  wialonToken: string;
  depotLat: string;
  depotLon: string;
  depotRadiusKm: string;
  depotName: string;
  wialonReportResourceId: string;
  wialonReportTemplateId: string;
  wialonDriversResourceId: string;
  enabled: boolean;
};
const EMPTY_WIALON_FORM: WialonForm = {
  wialonToken: '',
  depotLat: '',
  depotLon: '',
  depotRadiusKm: '',
  depotName: '',
  wialonReportResourceId: '',
  wialonReportTemplateId: '',
  wialonDriversResourceId: '',
  enabled: true,
};

function wialonConfigToForm(config: WialonConfig): WialonForm {
  return {
    wialonToken: config.wialonToken,
    depotLat: String(config.depotLat),
    depotLon: String(config.depotLon),
    depotRadiusKm: String(config.depotRadiusKm),
    depotName: config.depotName,
    wialonReportResourceId: String(config.wialonReportResourceId),
    wialonReportTemplateId: String(config.wialonReportTemplateId),
    wialonDriversResourceId: config.wialonDriversResourceId != null ? String(config.wialonDriversResourceId) : '',
    enabled: config.enabled,
  };
}

// Панель керування однією компанією — розгортається під її рядком у таблиці. Форма
// користувача — завжди upsert за email (той самий /api/platform/users, що описаний
// в docs), форма Wialon — завжди повна заміна конфігу (PUT), бо ендпоінт не підтримує
// частковий patch.
function CompanyPanel({ company }: { company: PlatformCompany }) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [userForm, setUserForm] = useState<UserForm>(EMPTY_USER_FORM);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [userSaving, setUserSaving] = useState(false);

  function loadUsers() {
    setUsersLoading(true);
    setUsersError(null);
    platformFetch<PlatformUser[]>(`/companies/${company.id}/users`)
      .then(setUsers)
      .catch((err) => setUsersError(err instanceof PlatformApiError ? err.message : 'Не вдалося завантажити користувачів'))
      .finally(() => setUsersLoading(false));
  }

  useEffect(loadUsers, [company.id]);

  const [wialonForm, setWialonForm] = useState<WialonForm>(EMPTY_WIALON_FORM);
  const [wialonLoading, setWialonLoading] = useState(true);
  const [wialonConfigured, setWialonConfigured] = useState(false);
  const [wialonError, setWialonError] = useState<string | null>(null);
  const [wialonSuccess, setWialonSuccess] = useState<string | null>(null);
  const [wialonSaving, setWialonSaving] = useState(false);

  useEffect(() => {
    setWialonLoading(true);
    setWialonError(null);
    platformFetch<WialonConfig>(`/companies/${company.id}/wialon-config`)
      .then((config) => {
        setWialonForm(wialonConfigToForm(config));
        setWialonConfigured(true);
      })
      .catch((err) => {
        if (err instanceof PlatformApiError && err.status === 404) {
          setWialonForm(EMPTY_WIALON_FORM);
          setWialonConfigured(false);
        } else {
          setWialonError(err instanceof PlatformApiError ? err.message : 'Не вдалося завантажити Wialon-конфіг');
        }
      })
      .finally(() => setWialonLoading(false));
  }, [company.id]);

  async function handleUserSubmit(e: FormEvent) {
    e.preventDefault();
    setUserError(null);
    setUserSuccess(null);
    if (!userForm.email.trim() || userForm.password.length < 8) {
      setUserError('Вкажіть email і пароль (щонайменше 8 символів)');
      return;
    }
    setUserSaving(true);
    try {
      await platformFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ ...userForm, email: userForm.email.trim(), companyId: company.id }),
      });
      setUserSuccess(`Готово: ${userForm.email.trim()} → ${userForm.role}`);
      setUserForm(EMPTY_USER_FORM);
      loadUsers();
    } catch (err) {
      setUserError(err instanceof PlatformApiError ? err.message : 'Не вдалося зберегти користувача');
    } finally {
      setUserSaving(false);
    }
  }

  async function handleWialonSubmit(e: FormEvent) {
    e.preventDefault();
    setWialonError(null);
    setWialonSuccess(null);

    const depotLat = Number(wialonForm.depotLat);
    const depotLon = Number(wialonForm.depotLon);
    const depotRadiusKm = Number(wialonForm.depotRadiusKm);
    const wialonReportResourceId = Number(wialonForm.wialonReportResourceId);
    const wialonReportTemplateId = Number(wialonForm.wialonReportTemplateId);
    if (!wialonForm.wialonToken.trim() || !wialonForm.depotName.trim()) {
      setWialonError('Вкажіть Wialon token і назву депо');
      return;
    }
    if ([depotLat, depotLon, depotRadiusKm, wialonReportResourceId, wialonReportTemplateId].some(Number.isNaN)) {
      setWialonError('Числові поля мають бути числами');
      return;
    }

    setWialonSaving(true);
    try {
      const saved = await platformFetch<WialonConfig>(`/companies/${company.id}/wialon-config`, {
        method: 'PUT',
        body: JSON.stringify({
          wialonToken: wialonForm.wialonToken.trim(),
          depotLat,
          depotLon,
          depotRadiusKm,
          depotName: wialonForm.depotName.trim(),
          wialonReportResourceId,
          wialonReportTemplateId,
          wialonDriversResourceId: wialonForm.wialonDriversResourceId === '' ? null : Number(wialonForm.wialonDriversResourceId),
          enabled: wialonForm.enabled,
        }),
      });
      setWialonForm(wialonConfigToForm(saved));
      setWialonConfigured(true);
      setWialonSuccess('Wialon-конфіг збережено — sync-service підхопить його на наступному циклі (до ~15 хв)');
    } catch (err) {
      setWialonError(err instanceof PlatformApiError ? err.message : 'Не вдалося зберегти конфіг');
    } finally {
      setWialonSaving(false);
    }
  }

  return (
    <div style={{ padding: '4px 4px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="card-title" style={{ fontSize: 13 }}>Користувачі компанії</div>
        <div className="card-title-sub">
          Пароль ніде не зберігається у відновлюваному вигляді (лише хеш) — «скинути» означає задати новий, не побачити старий
        </div>

        {usersError && <div className="empty">{usersError}</div>}
        {!usersError && usersLoading && <div className="empty">Завантаження…</div>}
        {!usersError && !usersLoading && (
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Роль</th>
                <th>Створено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">Ще немає жодного користувача — додайте нижче</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                      {new Date(u.createdAt).toLocaleDateString('uk-UA')}
                    </td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '5px 9px', fontSize: 11 }}
                        onClick={() => {
                          setUserForm({ email: u.email, password: '', role: u.role });
                          setUserSuccess(null);
                          setUserError(null);
                        }}
                      >
                        Скинути пароль/роль
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="card-title" style={{ fontSize: 13 }}>Додати/оновити користувача</div>
        <div className="card-title-sub">
          Той самий email — оновить пароль і роль існуючого користувача, новий — створить логін для «{company.name}»
        </div>
        <form onSubmit={handleUserSubmit} style={formRow} autoComplete="off">
          {userError && <div className="login-error" style={{ width: '100%' }}>{userError}</div>}
          {userSuccess && (
            <div style={{ width: '100%', fontSize: 12, color: 'var(--green-600, #16a34a)' }}>{userSuccess}</div>
          )}
          <div>
            <div style={fieldLabel}>Email</div>
            <input
              type="email"
              name={`new-user-email-${company.id}`}
              autoComplete="off"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="admin@client.ua"
              style={{ width: 220 }}
            />
          </div>
          <div>
            <div style={fieldLabel}>Пароль</div>
            <input
              type="password"
              name={`new-user-password-${company.id}`}
              autoComplete="new-password"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              placeholder="щонайменше 8 символів"
              style={{ width: 180 }}
            />
          </div>
          <div>
            <div style={fieldLabel}>Роль</div>
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as 'admin' | 'viewer' })}
              style={{ width: 120 }}
            >
              <option value="admin">admin</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={userSaving}>
            {userSaving ? 'Збереження…' : 'Зберегти'}
          </button>
        </form>
      </div>

      <div>
        <div className="card-title" style={{ fontSize: 13 }}>
          Wialon-конфігурація {wialonConfigured ? '' : '(ще не налаштовано)'}
        </div>
        <div className="card-title-sub">
          Токен, депо і resource id звіту/водіїв цього клієнта — sync-service читає це з БД, без нового деплою
        </div>

        {wialonLoading && <div className="empty">Завантаження…</div>}

        {!wialonLoading && (
          <form onSubmit={handleWialonSubmit} style={formRow} autoComplete="off">
            {wialonError && <div className="login-error" style={{ width: '100%' }}>{wialonError}</div>}
            {wialonSuccess && (
              <div style={{ width: '100%', fontSize: 12, color: 'var(--green-600, #16a34a)' }}>{wialonSuccess}</div>
            )}
            <div>
              <div style={fieldLabel}>Wialon token</div>
              <input
                type="password"
                name={`wialon-token-${company.id}`}
                autoComplete="new-password"
                value={wialonForm.wialonToken}
                onChange={(e) => setWialonForm({ ...wialonForm, wialonToken: e.target.value })}
                style={{ width: 260 }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Депо: широта</div>
              <input
                type="number"
                value={wialonForm.depotLat}
                onChange={(e) => setWialonForm({ ...wialonForm, depotLat: e.target.value })}
                style={{ width: 110 }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Депо: довгота</div>
              <input
                type="number"
                value={wialonForm.depotLon}
                onChange={(e) => setWialonForm({ ...wialonForm, depotLon: e.target.value })}
                style={{ width: 110 }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Радіус депо, км</div>
              <input
                type="number"
                value={wialonForm.depotRadiusKm}
                onChange={(e) => setWialonForm({ ...wialonForm, depotRadiusKm: e.target.value })}
                style={{ width: 100 }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Назва депо</div>
              <input
                type="text"
                value={wialonForm.depotName}
                onChange={(e) => setWialonForm({ ...wialonForm, depotName: e.target.value })}
                placeholder="напр. Гніздичів"
                style={{ width: 160 }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Report resource id</div>
              <input
                type="number"
                value={wialonForm.wialonReportResourceId}
                onChange={(e) => setWialonForm({ ...wialonForm, wialonReportResourceId: e.target.value })}
                style={{ width: 130 }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Report template id</div>
              <input
                type="number"
                value={wialonForm.wialonReportTemplateId}
                onChange={(e) => setWialonForm({ ...wialonForm, wialonReportTemplateId: e.target.value })}
                style={{ width: 130 }}
              />
            </div>
            <div>
              <div style={fieldLabel}>Drivers resource id (необов'язково)</div>
              <input
                type="number"
                value={wialonForm.wialonDriversResourceId}
                onChange={(e) => setWialonForm({ ...wialonForm, wialonDriversResourceId: e.target.value })}
                placeholder="—"
                style={{ width: 150 }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-700)', paddingBottom: 8 }}>
              <input
                type="checkbox"
                checked={wialonForm.enabled}
                onChange={(e) => setWialonForm({ ...wialonForm, enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Синхронізація активна
            </label>
            <button className="btn btn-primary" type="submit" disabled={wialonSaving}>
              {wialonSaving ? 'Збереження…' : 'Зберегти'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function PlatformAdminPage() {
  const [unlocked, setUnlocked] = useState(() => getPlatformKey() !== null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformCompany | null>(null);

  const [newCompanyName, setNewCompanyName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function loadCompanies() {
    setLoading(true);
    setLoadError(null);
    platformFetch<PlatformCompany[]>('/companies')
      .then(setCompanies)
      .catch((err) => {
        if (err instanceof PlatformApiError && err.status === 401) {
          setPlatformKey(null);
          setUnlocked(false);
          return;
        }
        setLoadError(err instanceof PlatformApiError ? err.message : 'Не вдалося завантажити список компаній');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (unlocked) loadCompanies();
  }, [unlocked]);

  if (!unlocked) {
    return <PlatformKeyGate onUnlocked={() => setUnlocked(true)} />;
  }

  async function handleCreateCompany(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!newCompanyName.trim()) {
      setCreateError('Вкажіть назву компанії');
      return;
    }
    setCreating(true);
    try {
      const created = await platformFetch<PlatformCompany>('/companies', {
        method: 'POST',
        body: JSON.stringify({ name: newCompanyName.trim() }),
      });
      setCompanies((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'uk')),
      );
      setNewCompanyName('');
      setExpandedId(created.id);
    } catch (err) {
      setCreateError(err instanceof PlatformApiError ? err.message : 'Не вдалося створити компанію');
    } finally {
      setCreating(false);
    }
  }

  function handleLogout() {
    setPlatformKey(null);
    setUnlocked(false);
    setCompanies([]);
    setExpandedId(null);
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px' }}>
      <div className="topbar">
        <div>
          <div className="page-title">Платформа</div>
          <div className="page-sub">Онбординг клієнтів — компанії, логіни, Wialon-конфіг</div>
        </div>
        <button className="btn" onClick={handleLogout}>Вийти</button>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Компанії (клієнти платформи)</div>
            <div className="card-title-sub">Кожен рядок — окремий орендар (tenant), дані інших компаній йому не видно</div>
          </div>
        </div>

        <form onSubmit={handleCreateCompany} style={formRow}>
          {createError && <div className="login-error" style={{ width: '100%' }}>{createError}</div>}
          <div>
            <div style={fieldLabel}>Назва нової компанії</div>
            <input
              type="text"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="напр. ФОП Іваненко"
              style={{ width: 260 }}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? 'Створення…' : 'Додати компанію'}
          </button>
        </form>

        {loadError && <div className="empty">{loadError}</div>}
        {!loadError && loading && <div className="empty">Завантаження…</div>}

        {!loadError && !loading && (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Створено</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty">Ще немає жодної компанії — додайте першу вище</td>
                  </tr>
                ) : (
                  companies.map((c) => (
                    <Fragment key={c.id}>
                      <tr>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                          {new Date(c.createdAt).toLocaleDateString('uk-UA')}
                        </td>
                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="btn"
                            style={{ padding: '5px 9px', fontSize: 11 }}
                            onClick={() => setExpandedId((prev) => (prev === c.id ? null : c.id))}
                          >
                            {expandedId === c.id ? 'Згорнути' : 'Керувати'}
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '5px 9px', fontSize: 11, color: 'var(--red-600)' }}
                            onClick={() => setDeleteTarget(c)}
                          >
                            Видалити
                          </button>
                        </td>
                      </tr>
                      {expandedId === c.id && (
                        <tr>
                          <td colSpan={3} style={{ background: 'var(--gray-50)' }}>
                            <CompanyPanel company={c} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteCompanyModal
          company={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(id) => {
            setCompanies((prev) => prev.filter((c) => c.id !== id));
            if (expandedId === id) setExpandedId(null);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
