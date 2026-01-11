
import React, { useState, useEffect, useRef } from 'react';
import { Location, StoreProfile } from '../types';

interface StoreRegistrationProps {
  onSignup: (profile: Omit<StoreProfile, 'id' | 'status' | 'registrationDate' | 'balance' | 'deliveryRadius'>) => void;
  onBack: () => void;
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

const StoreRegistration: React.FC<StoreRegistrationProps> = ({ onSignup, onBack }) => {
  const [form, setForm] = useState({
    name: '',
    email: '',
    taxId: '',
    password: '',
    cep: '',
    city: '',
    address: '',
    number: ''
  });

  const [coords, setCoords] = useState<Location>({ lat: -23.5505, lng: -46.6333 });
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSearchingGps, setIsSearchingGps] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);

  // Tentar obter localização automática ao carregar a página
  useEffect(() => {
    handleUseGps();
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapContainerRef.current || mapRef.current) return;

    const startLat = sanitizeCoord(coords.lat, -23.5505);
    const startLng = sanitizeCoord(coords.lng, -46.6333);

    try {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([startLat, startLng], 15);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);

      markerRef.current = L.marker([startLat, startLng], {
        draggable: true
      }).addTo(mapRef.current);

      markerRef.current.on('dragend', () => {
        const pos = markerRef.current.getLatLng();
        if (isValidNumber(pos.lat) && isValidNumber(pos.lng)) {
          setCoords({ lat: pos.lat, lng: pos.lng });
        }
      });
    } catch (err) {
      console.error("Map init error:", err);
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
    if (mapRef.current && markerRef.current && isValidNumber(coords.lat) && isValidNumber(coords.lng)) {
      try {
        const lat = sanitizeCoord(coords.lat, -23.5505);
        const lng = sanitizeCoord(coords.lng, -46.6333);
        mapRef.current.flyTo([lat, lng], 17, { duration: 1.5, animate: true });
        markerRef.current.setLatLng([lat, lng]);
      } catch (err) {
        console.warn("Auto-ajuste falhou", err);
      }
    }
  }, [coords.lat, coords.lng]);

  const handleUseGps = () => {
    if (!navigator.geolocation) return;

    setIsSearchingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });

        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
          const data = await response.json();

          if (data && data.address) {
            const street = data.address.road || '';
            const neighborhood = data.address.suburb || data.address.neighbourhood || '';
            const city = data.address.city || data.address.town || data.address.village || '';
            const cep = data.address.postcode || '';

            setForm(prev => ({
              ...prev,
              address: street ? `${street}, ${neighborhood}` : neighborhood,
              city: city,
              cep: cep.replace(/\D/g, '').substring(0, 8),
              number: data.address.house_number || ''
            }));
          }
        } catch (error) {
          console.error("Erro na geocodificação reversa:", error);
        } finally {
          setIsSearchingGps(false);
        }
      },
      (error) => {
        setIsSearchingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCepBlur = async () => {
    const cleanCep = form.cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setIsSearchingCep(true);
      try {
        const cepResponse = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const cepData = await cepResponse.json();
        
        if (!cepData.erro) {
          const newAddress = `${cepData.logradouro}, ${cepData.bairro}`;
          const newCity = cepData.localidade;
          
          setForm(prev => ({ ...prev, address: newAddress, city: newCity }));

          let geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanCep}&country=Brazil&limit=1`);
          let geoData = await geoResponse.json();

          if (!geoData || geoData.length === 0) {
            geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${newAddress}, ${newCity}, Brazil`)}&limit=1`);
            geoData = await geoResponse.json();
          }

          if (geoData && geoData.length > 0) {
            const newLat = parseFloat(geoData[0].lat);
            const newLng = parseFloat(geoData[0].lon);
            if (isValidNumber(newLat) && isValidNumber(newLng)) {
              setCoords({ lat: newLat, lng: newLng });
            }
          }
        }
      } catch (e) {
        console.error("Erro busca CEP:", e);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const required = ['name', 'email', 'taxId', 'password', 'cep', 'city', 'address', 'number'];
    if (required.every(f => form[f as keyof typeof form].trim())) {
      setIsSubmitting(true);
      setTimeout(() => {
        onSignup({ 
          ...form, 
          address: `${form.address}, ${form.number}`, 
          location: { 
            lat: sanitizeCoord(coords.lat, -23.5505), 
            lng: sanitizeCoord(coords.lng, -46.6333), 
            address: `${form.address}, ${form.number}` 
          } 
        });
      }, 1000);
    } else {
      alert("Preencha todos os campos.");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f7f7f7] flex items-center justify-center p-0 md:p-6 py-0 md:py-12">
      <div className="w-full max-w-6xl bg-white rounded-none md:rounded-[3rem] shadow-none md:shadow-2xl overflow-hidden flex flex-col md:flex-row border-0 md:border border-gray-100 h-full md:h-auto">
        
        <div className="w-full md:w-1/2 p-6 md:p-12 flex flex-col h-full bg-white overflow-y-auto">
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-black text-gray-800 italic tracking-tighter font-jaa">Jaa <span className="text-[#F84F39] not-italic">Lojas</span></h2>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">Cadastro de Estabelecimento</p>
            </div>
            <div className="flex flex-col items-center gap-1">
                <button 
                  type="button" 
                  onClick={handleUseGps} 
                  disabled={isSearchingGps}
                  className="w-12 h-12 jaa-gradient rounded-2xl flex items-center justify-center text-white shadow-xl hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSearchingGps ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <span className="text-xl">🎯</span>}
                </button>
                <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">GPS ATIVO</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="text" placeholder="Nome Fantasia" className="w-full px-6 py-4.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input type="text" placeholder="CNPJ" className="w-full px-6 py-4.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={form.taxId} onChange={e => setForm({...form, taxId: e.target.value})} />
              <input type="email" placeholder="E-mail" className="w-full px-6 py-4.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <input type="text" placeholder="CEP" className="w-full px-6 py-4.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" onBlur={handleCepBlur} value={form.cep} onChange={e => setForm({...form, cep: e.target.value})} />
                {isSearchingCep && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#F84F39] border-t-transparent rounded-full animate-spin"></div>}
              </div>
              <input type="text" placeholder="Nº" className="w-full px-6 py-4.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={form.number} onChange={e => setForm({...form, number: e.target.value})} />
            </div>

            <input type="text" placeholder="Cidade" readOnly className="w-full px-6 py-4.5 bg-white border border-gray-100 rounded-2xl outline-none font-black text-[#F84F39] text-sm" value={form.city} />
            <input type="text" placeholder="Endereço" className="w-full px-6 py-4.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold text-sm" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            <input type="password" placeholder="Senha" className="w-full px-6 py-4.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />

            <div className="pt-6">
              <button disabled={isSubmitting} className={`w-full ${isSubmitting ? 'bg-gray-400' : 'jaa-gradient'} text-white font-black py-5 rounded-2xl shadow-xl shadow-red-100 text-xs uppercase tracking-widest active:scale-95 transition-all`}>
                {isSubmitting ? 'PROCESSANDO...' : 'CRIAR CONTA'}
              </button>
              <button type="button" onClick={onBack} className="w-full py-4 text-gray-300 font-black text-[10px] uppercase tracking-widest">Voltar</button>
            </div>
          </form>
        </div>

        <div className="w-full md:w-1/2 bg-gray-50 flex flex-col relative order-first md:order-last h-64 md:h-auto">
           <div className="absolute top-6 left-6 right-6 z-10">
              <h3 className="text-[10px] font-black text-gray-800 uppercase bg-white/95 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg inline-block border border-gray-100">
                {isSearchingGps ? '📍 Obtendo GPS...' : '📍 Localização Automática'}
              </h3>
           </div>
           <div ref={mapContainerRef} className="flex-1 w-full h-full"></div>
        </div>
      </div>
    </div>
  );
};

export default StoreRegistration;
