import React, { useEffect, useRef } from 'react';
import { Location } from '../types';

interface MapViewProps {
  markers: {
    id: string;
    type: 'STORE' | 'DRIVER' | 'DROPOFF' | 'ASSIGNED_DRIVER';
    location: Location;
    name?: string;
  }[];
  userLocation?: Location;
  zoom?: number;
  radiusKm?: number;
}

const isValidNumber = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return !isNaN(num) && isFinite(num);
};

const sanitizeCoord = (val: any, fallback: number): number => {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) || !isFinite(num) ? fallback : num;
};

const isValidLocation = (loc?: Location): boolean => {
  return !!loc && isValidNumber(loc.lat) && isValidNumber(loc.lng);
};

const MapView: React.FC<MapViewProps> = ({ markers, userLocation, zoom: initialZoom = 14, radiusKm = 0 }) => {
  const [map, setMap] = React.useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletMarkers = useRef<Map<string, any>>(new Map());
  const circleRef = useRef<any>(null);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !containerRef.current || map) return;

    const startLat = sanitizeCoord(userLocation?.lat, -23.55);
    const startLng = sanitizeCoord(userLocation?.lng, -46.63);
    const safeZoom = sanitizeCoord(initialZoom, 14);

    let mapInstance: any = null;

    try {
      mapInstance = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        fadeAnimation: true
      }).setView([startLat, startLng], safeZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapInstance);

      setMap(mapInstance);
    } catch (err) {
      console.warn("Leaflet Init Catch:", err);
    }

    return () => {
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (e) {}
      }
      setMap(null);
      leafletMarkers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (map && isValidLocation(userLocation)) {
      try {
        const lat = sanitizeCoord(userLocation!.lat, -23.55);
        const lng = sanitizeCoord(userLocation!.lng, -46.63);
        if (isValidNumber(lat) && isValidNumber(lng)) {
            map.flyTo([lat, lng], map.getZoom(), {
              duration: 1.5,
              animate: true
            });
        }
      } catch (err) {
        console.warn("Mapa centralização ignorada", err);
      }
    }
  }, [map, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map) return;

    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (radiusKm > 0 && isValidLocation(userLocation)) {
      try {
        const lat = sanitizeCoord(userLocation!.lat, -23.55);
        const lng = sanitizeCoord(userLocation!.lng, -46.63);
        if (isValidNumber(lat) && isValidNumber(lng)) {
            circleRef.current = L.circle([lat, lng], {
              radius: radiusKm * 1000,
              color: '#F84F39',
              fillColor: '#FFB800',
              fillOpacity: 0.1,
              weight: 2,
              dashArray: '5, 10'
            }).addTo(map);
        }
      } catch (e) {
        console.warn("Erro ao desenhar raio:", e);
      }
    }
  }, [map, radiusKm, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map) return;

    const currentIds = new Set(markers.map(m => m.id));
    leafletMarkers.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        leafletMarkers.current.delete(id);
      }
    });

    markers.forEach(m => {
      if (!isValidLocation(m.location)) return;

      const lat = sanitizeCoord(m.location.lat, 0);
      const lng = sanitizeCoord(m.location.lng, 0);
      
      if (!isValidNumber(lat) || !isValidNumber(lng)) return;

      let iconColor = '#0085FF';
      let iconEmoji = '🏍️';
      let extraClass = '';

      if (m.type === 'STORE') {
        iconColor = 'linear-gradient(135deg, #F84F39 0%, #FFB800 100%)';
        iconEmoji = '🏪';
      } else if (m.type === 'DROPOFF') {
        iconColor = '#1e293b';
        iconEmoji = '📍';
      } else if (m.type === 'ASSIGNED_DRIVER') {
        iconColor = '#F84F39';
        iconEmoji = '🛵';
        extraClass = 'animate-pulse ring-4 ring-orange-400 ring-offset-2 scale-110';
      }
      
      const iconHtml = `
        <div class="relative flex flex-col items-center" style="width: 40px; height: 40px;">
          <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-xl border-2 border-white transition-all transform ${extraClass}" 
               style="background: ${iconColor};">
            ${iconEmoji}
          </div>
          <div class="absolute -bottom-8 bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-lg shadow-lg border border-gray-100 whitespace-nowrap pointer-events-none z-50">
            <p class="text-[8px] font-black text-gray-800 uppercase tracking-tighter">${m.name || ''}</p>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'jaa-marker-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      try {
        const position = L.latLng(lat, lng);
        let marker = leafletMarkers.current.get(m.id);
        if (marker) {
          marker.setLatLng(position);
          marker.setIcon(customIcon);
        } else {
          marker = L.marker(position, { 
            icon: customIcon,
            zIndexOffset: m.type === 'STORE' ? 1000 : 500 
          }).addTo(map);
          leafletMarkers.current.set(m.id, marker);
        }
      } catch (e) {
        console.warn("Marcador ignorado:", m.id, e);
      }
    });
  }, [map, markers]);

  return (
    <div className="w-full h-full relative group">
      <div ref={containerRef} className="w-full h-full z-0 bg-gray-100" />
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
        <button onClick={() => map?.zoomIn()} className="w-10 h-10 bg-white rounded-xl shadow-lg flex items-center justify-center text-xl font-bold text-gray-800 border border-gray-100 active:scale-90 transition-all">+</button>
        <button onClick={() => map?.zoomOut()} className="w-10 h-10 bg-white rounded-xl shadow-lg flex items-center justify-center text-xl font-bold text-gray-800 border border-gray-100 active:scale-90 transition-all">−</button>
      </div>
    </div>
  );
};

export default MapView;