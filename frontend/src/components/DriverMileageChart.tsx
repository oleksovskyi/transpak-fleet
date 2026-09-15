import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMileageLogs } from '../lib/useMileageLogs';
import { driverMileageInRange } from '../lib/mileageStats';
import { CHART_COLORS } from '../lib/chartColors';
import { fmt } from '../lib/maintenanceStatus';

export default function DriverMileageChart() {
  const { mileageLogs, loading, error } = useMileageLogs();

  const top = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400000);
    // recharts малює вертикальний bar-чарт зверху вниз у порядку масиву — array[0] уже йде
    // згори, тож для "від більшого до меншого" reverse() не потрібен (сортування спадне вже
    // забезпечує driverMileageInRange).
    return driverMileageInRange(mileageLogs, from, to)
      .slice(0, 5)
      .map((d) => ({ name: d.driverName, km: d.km }));
  }, [mileageLogs]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Найбільший пробіг за місяць</div>
          <div className="card-title-sub">по водіях, за поточним закріпленням ТЗ</div>
        </div>
      </div>
      {error && <div className="empty">{error}</div>}
      {!error && loading && <div className="empty">Завантаження…</div>}
      {!error && !loading && top.length === 0 && <div className="empty">Немає даних по пробігу водіїв за останній місяць</div>}
      {!error && !loading && top.length > 0 && (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={top} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} />
            <YAxis type="category" dataKey="name" width={185} tick={{ fontSize: 11, fill: CHART_COLORS.axisTextDark }} />
            <Tooltip
              formatter={(value) => [`${fmt(Number(value))} км`, '']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_COLORS.gridLine}` }}
            />
            <Bar dataKey="km" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
