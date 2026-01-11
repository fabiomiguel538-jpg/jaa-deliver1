
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
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletMarkers = useRef<Map<string, any>>(new Map());
  const circleRef = useRef<any>(null);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !containerRef.current || mapRef.current) return;

    const startLat = sanitizeCoord(userLocation?.lat, -23.55);
    const startLng = sanitizeCoord(userLocation?.lng, -46.63);
    const safeZoom = sanitizeCoord(initialZoom, 14);

    try {
      mapRef.current = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        fadeAnimation: true
      }).setView([startLat, startLng], safeZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current);
    } catch (err) {
      console.warn("Leaflet Init Catch:", err);
    }

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && isValidLocation(userLocation)) {
      try {
        const lat = sanitizeCoord(userLocation!.lat, -23.55);
        const lng = sanitizeCoord(userLocation!.lng, -46.63);
        mapRef.current.flyTo([lat, lng], mapRef.current.getZoom(), {
          duration: 1.5,
          animate: true
        });
      } catch (err) {
        console.warn("Mapa centralização ignorada", err);
      }
    }
  }, [userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (radiusKm > 0 && isValidLocation(userLocation)) {
      try {
        const lat = sanitizeCoord(userLocation!.lat, -23.55);
        const lng = sanitizeCoord(userLocation!.lng, -46.63);
        circleRef.current = L.circle([lat, lng], {
          radius: radiusKm * 1000,
          color: '#F84F39',
          fillColor: '#FFB800',
          fillOpacity: 0.1,
          weight: 2,
          dashArray: '5, 10'
        }).addTo(mapRef.current);
      } catch (e) {
        console.warn("Erro ao desenhar raio:", e);
      }
    }
  }, [radiusKm, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

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
        <div class="relative flex flex-col items-center">
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
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      try {
        let marker = leafletMarkers.current.get(m.id);
        if (marker) {
          marker.setLatLng([lat, lng]);
          marker.setIcon(customIcon);
        } else {
          marker = L.marker([lat, lng], { icon: customIcon }).addTo(mapRef.current);
          leafletMarkers.current.set(m.id, marker);
        }
      } catch (e) {
        console.warn("Marcador ignorado:", m.id, e);
      }
    });
  }, [markers]);

  return (
    <div className="w-full h-full relative group">
      <div ref={containerRef} className="w-full h-full z-0 bg-gray-100" />
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
        <button onClick={() => mapRef.current?.zoomIn()} className="w-10 h-10 bg-white rounded-xl shadow-lg flex items-center justify-center text-xl font-bold text-gray-800 border border-gray-100 active:scale-90 transition-all">+</button>
        <button onClick={() => mapRef.current?.zoomOut()} className="w-10 h-10 bg-white rounded-xl shadow-lg flex items-center justify-center text-xl font-bold text-gray-800 border border-gray-100 active:scale-90 transition-all">−</button>
      </div>
    </div>
  );
};

export default MapView;
