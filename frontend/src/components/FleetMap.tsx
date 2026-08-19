import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TRUCK_STATUS_LABEL, fmt } from '../lib/maintenanceStatus';
import { Truck, TruckStatus } from '../types';

const STATUS_COLOR: Record<TruckStatus, string> = {
  trip: '#2e6bb0',
  free: '#1b8a5a',
  service: '#b8790b',
  repair: '#c23b3b',
};

// Межі України (SW, NE) — карта початково показує всю країну, а не зміщується
// в бік депо на заході й захоплює сусідні Польщу/Словаччину.
const UKRAINE_BOUNDS: [[number, number], [number, number]] = [
  [22.0, 44.2],
  [40.3, 52.5],
];

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function positionUpdatedLabel(trucks: Truck[]): string {
  const timestamps = trucks.map((t) => t.positionUpdatedAt).filter((x): x is string => !!x);
  if (timestamps.length === 0) return 'ще немає даних GPS';
  const latest = timestamps.reduce((a, b) => (a > b ? a : b));
  const mins = minutesAgo(latest);
  if (mins < 1) return 'оновлено щойно';
  return `оновлено ${mins} хв тому`;
}

export default function FleetMap({ trucks }: { trucks: Truck[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Record<TruckStatus, Marker[]>>({ trip: [], free: [], service: [], repair: [] });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      bounds: UKRAINE_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function draw(map: MapLibreMap) {
      (Object.keys(markersRef.current) as TruckStatus[]).forEach((s) => {
        markersRef.current[s].forEach((m) => m.remove());
        markersRef.current[s] = [];
      });
      trucks
        .filter((t) => t.lat != null && t.lon != null)
        .forEach((t) => {
          const el = document.createElement('div');
          el.className = 'truck-marker-dom';
          el.style.background = STATUS_COLOR[t.status];

          const popupHtml = `
            <div class="map-popup-title">${t.plate} · ${t.model}</div>
            <div class="map-popup-row">Статус: <b style="color:${STATUS_COLOR[t.status]}">${TRUCK_STATUS_LABEL[t.status]}</b></div>
            <div class="map-popup-row">Водій: ${t.driver?.fullName ?? '—'}</div>
            <div class="map-popup-row">Пробіг: ${fmt(t.totalMileageKm)} км</div>
          `;
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([t.lon as number, t.lat as number])
            .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(popupHtml))
            .addTo(map);
          markersRef.current[t.status].push(marker);
        });
    }

    if (map.loaded()) draw(map);
    else map.once('load', () => draw(map));
  }, [trucks]);

  function toggleStatus(status: TruckStatus, hidden: boolean) {
    markersRef.current[status].forEach((m) => (m.getElement().style.display = hidden ? 'none' : 'block'));
  }

  const withPosition = trucks.filter((t) => t.lat != null && t.lon != null);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Карта автопарку — живі позиції</div>
          <div className="card-title-sub">{positionUpdatedLabel(trucks)}</div>
        </div>
      </div>
      <div ref={containerRef} id="fleetMap" />
      <div className="map-legend">
        {(Object.keys(STATUS_COLOR) as TruckStatus[]).map((status) => {
          const count = withPosition.filter((t) => t.status === status).length;
          return (
            <label className="map-legend-item" key={status}>
              <input
                type="checkbox"
                defaultChecked
                style={{ display: 'none' }}
                onChange={(e) => toggleStatus(status, !e.target.checked)}
              />
              <span className="map-legend-dot" style={{ background: STATUS_COLOR[status] }} />
              {TRUCK_STATUS_LABEL[status]} ({count})
            </label>
          );
        })}
      </div>
      {trucks.length > withPosition.length && (
        <div className="card-title-sub" style={{ marginTop: 10 }}>
          {trucks.length - withPosition.length} ТЗ без даних GPS (ще не синхронізовано або без Wialon unit)
        </div>
      )}
    </div>
  );
}
