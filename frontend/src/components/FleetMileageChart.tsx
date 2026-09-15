import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMileageLogs } from '../lib/useMileageLogs';
import { customRangeBucket, fleetMileageSeries, FleetViewMode, viewModeRange } from '../lib/mileageStats';
import { CHART_COLORS } from '../lib/chartColors';
import { fmt } from '../lib/maintenanceStatus';

type Mode = FleetViewMode | 'custom';
const MODE_LABEL: Record<FleetViewMode, string> = { day: 'День', week: 'Тиждень', month: 'Місяць' };

export default function FleetMileageChart() {
  const { mileageLogs, loading, error } = useMileageLogs();
  const [mode, setMode] = useState<Mode>('day');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const series = useMemo(() => {
    if (mode === 'custom') {
      if (!customFrom || !customTo) return [];
      const from = new Date(customFrom);
      const to = new Date(customTo);
      if (from.getTime() > to.getTime()) return [];
      return fleetMileageSeries(mileageLogs, from, to, customRangeBucket(from, to));
    }
    const { from, to, bucket } = viewModeRange(mode);
    return fleetMileageSeries(mileageLogs, from, to, bucket);
  }, [mileageLogs, mode, customFrom, customTo]);

  const totalKm = series.reduce((sum, p) => sum + p.km, 0);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Пробіг автопарку</div>
          <div className="card-title-sub">разом {fmt(totalKm)} км за обраний період</div>
        </div>
        <div className="filters">
          {(Object.keys(MODE_LABEL) as FleetViewMode[]).map((m) => (
            <button
              key={m}
              className={`btn${mode === m ? ' btn-primary' : ''}`}
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => setMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
          <button
            className={`btn${mode === 'custom' ? ' btn-primary' : ''}`}
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => setMode('custom')}
          >
            Період
          </button>
          {mode === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 135 }} />
              <span style={{ color: 'var(--gray-500)', fontSize: 12 }}>—</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 135 }} />
            </>
          )}
        </div>
      </div>

      {error && <div className="empty">{error}</div>}
      {!error && loading && <div className="empty">Завантаження…</div>}
      {!error && !loading && mode === 'custom' && (!customFrom || !customTo) && (
        <div className="empty">Оберіть обидві дати періоду</div>
      )}
      {!error && !loading && series.length === 0 && !(mode === 'custom' && (!customFrom || !customTo)) && (
        <div className="empty">Немає даних по пробігу за обраний період</div>
      )}
      {!error && !loading && series.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={series} margin={{ left: -10, right: 10, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} />
            <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} allowDecimals={false} tickFormatter={(v) => fmt(v)} />
            <Tooltip
              formatter={(value) => [`${fmt(Number(value))} км`, 'Пробіг']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_COLORS.gridLine}` }}
            />
            <Bar dataKey="km" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
