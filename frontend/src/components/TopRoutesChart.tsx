import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRouteLogs } from '../lib/useRouteLogs';
import { aggregateRoutes } from '../lib/routeStats';
import { CHART_COLORS } from '../lib/chartColors';

export default function TopRoutesChart() {
  const { routeLogs, loading, error } = useRouteLogs();

  const top = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = routeLogs.filter((l) => new Date(l.date).getTime() >= monthStart.getTime());
    // recharts малює вертикальний bar-чарт зверху вниз у порядку масиву — array[0] уже йде
    // згори, тож для "від більшого до меншого" reverse() НЕ потрібен (aggregateRoutes і так
    // сортує спадно).
    return aggregateRoutes(thisMonth)
      .slice(0, 5)
      .map((r) => ({ name: `${r.fromCity} → ${r.toCity}`, trips: r.trips }));
  }, [routeLogs]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Топ маршрутів за кількістю рейсів</div>
          <div className="card-title-sub">за поточний місяць</div>
        </div>
      </div>
      {error && <div className="empty">{error}</div>}
      {!error && loading && <div className="empty">Завантаження…</div>}
      {!error && !loading && top.length === 0 && <div className="empty">Ще немає жодного рейсу цього місяця</div>}
      {!error && !loading && top.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={top} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: CHART_COLORS.axisTextDark }} />
            <Tooltip
              formatter={(value) => [`${value} рейсів`, '']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_COLORS.gridLine}` }}
            />
            <Bar dataKey="trips" fill={CHART_COLORS.blue} radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
