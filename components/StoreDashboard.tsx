import React, { useState, useEffect, useRef } from 'react';
import { Order, OrderStatus, StoreProfile, Location, DriverProfile, PlatformSettings } from '../types';
import MapView from './MapView';

interface StoreDashboardProps {
  onLogout: () => void;
  orders: Order[];
  onNewOrder: (order: Order) => void;
  onCancelOrder: (id: string) => void;
  onRechargeRequest: (storeId: string, amount: number) => void;
  profile: StoreProfile;
  settings: PlatformSettings;
  onlineDrivers: DriverProfile[];
  onUpdateRadius: (radius: number) => void;
  onAccessRequest: (id: string, type: 'DAILY' | 'MONTHLY') => void;
  onUpdateProfile: (id: string, data: Partial<StoreProfile>) => void;
}

const calculateDistance = (loc1: Location, loc2: Location): number => {
  const R = 6371; // km
  const lat1 = Number(loc1.lat);
  const lng1 = Number(loc1.lng);
  const lat2 = Number(loc2.lat);
  const lng2 = Number(loc2.lng);
  if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return Infinity;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const sanitizeCoord = (val: any, fallback: number): number => {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) || !isFinite(num) ? fallback : num;
};

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const StoreDashboard: React.FC<StoreDashboardProps> = ({ 
  onLogout, orders, onNewOrder, onCancelOrder, onRechargeRequest, profile, settings, onlineDrivers, onUpdateRadius, onAccessRequest, onUpdateProfile 
}) => {
  const [isRequesting, setIsRequesting] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [isAutoAdjusting, setIsAutoAdjusting] = useState(false);
  const [activeTab, setActiveTab] = useState<'inProgress' | 'history'>('inProgress');
  
  const [deliveryCep, setDeliveryCep] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryAddressFound, setDeliveryAddressFound] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState<Location | null>(null);
  const [searchingDeliveryCep, setSearchingDeliveryCep] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [estimation, setEstimation] = useState<{ total: number; distance: number } | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'details' | 'payment'>('details');

  const [tempProfile, setTempProfile] = useState({
    name: profile?.name || '',
    cep: profile?.cep || '',
    city: profile?.city || '',
    address: profile?.address || '',
    location: profile?.location || { lat: -23.5505, lng: -46.6333 }
  });

  const modalMapContainerRef = useRef<HTMLDivElement>(null);
  const modalMapRef = useRef<any>(null);
  const modalMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (isEditingProfile) {
      handleUseGps();
    }
  }, [isEditingProfile]);

  useEffect(() => {
    const L = (window as any).L;
    if (!isEditingProfile || !L || !modalMapContainerRef.current) return;
    const startLat = sanitizeCoord(tempProfile.location.lat, -23.55);
    const startLng = sanitizeCoord(tempProfile.location.lng, -46.63);
    if (!modalMapRef.current) {
      modalMapRef.current = L.map(modalMapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([startLat, startLng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(modalMapRef.current);
      const iconHtml = `<div class="w-10 h-10 rounded-2xl jaa-gradient flex items-center justify-center text-xl shadow-xl border-2 border-white ring-4 ring-orange-100">🏪</div>`;
      const customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
      modalMarkerRef.current = L.marker([startLat, startLng], { icon: customIcon, draggable: true }).addTo(modalMapRef.current);
      modalMarkerRef.current.on('dragend', () => {
        const pos = modalMarkerRef.current.getLatLng();
        setTempProfile(prev => ({ ...prev, location: { ...prev.location, lat: pos.lat, lng: pos.lng } }));
      });
    }
    return () => {
      if (modalMapRef.current) {
        modalMapRef.current.remove();
        modalMapRef.current = null;
      }
    };
  }, [isEditingProfile]);

  const handleUseGps = () => {
    if (!navigator.geolocation) return;
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setTempProfile(prev => ({ ...prev, location: { ...prev.location, lat: latitude, lng: longitude } }));
        if (modalMapRef.current && modalMarkerRef.current) {
          modalMapRef.current.flyTo([latitude, longitude], 17);
          modalMarkerRef.current.setLatLng([latitude, longitude]);
        }
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
          const data = await response.json();
          if (data && data.address) {
             setTempProfile(prev => ({
               ...prev,
               address: data.address.road || data.address.suburb || prev.address,
               city: data.address.city || data.address.town || prev.city,
               cep: (data.address.postcode || '').replace(/\D/g, '').substring(0, 8)
             }));
          }
        } catch (e) {} finally {
          setIsGpsLoading(false);
        }
      },
      () => setIsGpsLoading(false),
      { enableHighAccuracy: true }
    );
  };

  const handleAutoAdjust = async () => {
    if (!tempProfile.address && !tempProfile.cep) return;
    setIsAutoAdjusting(true);
    try {
      const query = encodeURIComponent(`${tempProfile.address}, ${tempProfile.city}, Brazil`);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setTempProfile(prev => ({ ...prev, location: { ...prev.location, lat, lng } }));
        if (modalMapRef.current && modalMarkerRef.current) {
          modalMapRef.current.flyTo([lat, lng], 17);
          modalMarkerRef.current.setLatLng([lat, lng]);
        }
      }
    } catch (e) {} finally {
      setIsAutoAdjusting(false);
    }
  };

  const handleCepLookup = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '').substring(0, 8);
    setTempProfile(prev => ({ ...prev, cep: cleanCep }));
    if (cleanCep.length === 8) {
      setSearchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          const newAddress = `${data.logradouro}, ${data.bairro}`;
          const newCity = data.localidade;
          setTempProfile(prev => ({ ...prev, city: newCity, address: newAddress }));
          let geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanCep}&country=Brazil&limit=1`);
          let geoData = await geoResponse.json();
          if (geoData && geoData.length > 0) {
            const lat = Number(geoData[0].lat);
            const lng = Number(geoData[0].lon);
            setTempProfile(prev => ({ ...prev, location: { lat, lng, address: `${newAddress}, ${newCity}` } }));
            if (modalMapRef.current && modalMarkerRef.current) {
              modalMapRef.current.flyTo([lat, lng], 16);
              modalMarkerRef.current.setLatLng([lat, lng]);
            }
          }
        }
      } catch (e) {} finally {
        setSearchingCep(false);
      }
    }
  };

  const handleDeliveryCepLookup = async (val: string) => {
    const cleanCep = val.replace(/\D/g, '').substring(0, 8);
    setDeliveryCep(cleanCep);
    setEstimation(null); 
    setDeliveryLocation(null);
    setDeliveryAddressFound('');
    setPaymentStep('details');

    if (cleanCep.length === 8) {
      setSearchingDeliveryCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          const addrStr = `${data.localidade}: ${data.logradouro}, ${data.bairro}`;
          setDeliveryAddressFound(addrStr);
          
          let geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanCep}&country=Brazil&limit=1`);
          let geoData = await geoResponse.json();
          
          if (!geoData || geoData.length === 0) {
            const query = encodeURIComponent(`${data.logradouro}, ${data.localidade}, Brazil`);
            geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
            geoData = await geoResponse.json();
          }

          if (geoData && geoData.length > 0) {
            const lat = Number(geoData[0].lat);
            const lng = Number(geoData[0].lon);
            if (!isNaN(lat) && !isNaN(lng)) {
              setDeliveryLocation({ lat, lng, address: addrStr });
            }
          } else {
            setDeliveryAddressFound(addrStr + " (Localização não encontrada)");
          }
        } else {
          setDeliveryAddressFound("CEP não encontrado");
        }
      } catch (e) {
        setDeliveryAddressFound("Erro na busca do endereço");
      } finally {
        setSearchingDeliveryCep(false);
      }
    }
  };

  const saveProfile = () => {
    onUpdateProfile(profile.id, tempProfile);
    setIsEditingProfile(false);
  };

  const handleEstimate = () => {
    if (!deliveryLocation || !safeStoreLocation) return;
    setIsCalculating(true);
    
    setTimeout(() => {
      const dist = calculateDistance(safeStoreLocation, deliveryLocation);
      const calculated = settings.minPrice + (dist * settings.pricePerKm);
      const total = Math.max(settings.minPrice, calculated);
      
      setEstimation({ total, distance: dist });
      setPaymentStep('payment');
      setIsCalculating(false);
    }, 600);
  };

  const createOrder = () => {
    if (!estimation || !deliveryLocation || !paymentReceipt) return;

    const storePrice = estimation.total;
    let driverReceives = 0;

    if (settings.driverEarningModel === 'PERCENTAGE') {
      driverReceives = storePrice * (settings.driverEarningPercentage / 100);
    } else { // FIXED
      driverReceives = settings.driverEarningFixed;
    }

    const streetInfo = deliveryAddressFound.split(': ')[1] || deliveryAddressFound;
    const finalAddress = `${streetInfo}, ${deliveryNumber}`;
    
    const newOrder: Order = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      storeId: profile.id,
      storeCity: profile.city || '', 
      status: OrderStatus.PENDING_PAYMENT_CONFIRMATION,
      pickup: safeStoreLocation,
      dropoff: { ...deliveryLocation, address: finalAddress },
      price: storePrice,
      driverEarning: driverReceives,
      distance: estimation.distance,
      timestamp: Date.now(),
      deliveryCode: Math.floor(1000 + Math.random() * 9000).toString(),
      paymentReceiptUrl: paymentReceipt,
    };
    onNewOrder(newOrder);
    resetRequest();
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPaymentReceipt(reader.result as string);
      // FIX: Corrected typo from readDataURL to readAsDataURL.
      reader.readAsDataURL(file);
    }
  };

  const resetRequest = () => {
    setIsRequesting(false);
    setEstimation(null);
    setDeliveryCep('');
    setDeliveryNumber('');
    setDeliveryAddressFound('');
    setDeliveryLocation(null);
    setIsCalculating(false);
    setPaymentStep('details');
    setPaymentReceipt(null);
  };

  const safeStoreLocation = {
    lat: Number(profile.location?.lat) || -23.5505,
    lng: Number(profile.location?.lng) || -46.6333
  };

  const activeOrders = orders.filter(o => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELED);
  const historyOrders = orders
    .filter(o => o.status === OrderStatus.DELIVERED || o.status === OrderStatus.CANCELED)
    .sort((a, b) => b.timestamp - a.timestamp);
  
  const cityDrivers = onlineDrivers.filter(d => (d.city || "").toLowerCase().trim() === (profile.city || "").toLowerCase().trim());

  const mapMarkers: { id: string; type: 'STORE' | 'DRIVER' | 'DROPOFF' | 'ASSIGNED_DRIVER'; location: Location; name?: string; }[] = [
    { id: profile.id, type: 'STORE' as const, location: safeStoreLocation, name: 'Sua Loja' },
    ...activeOrders.map(o => ({ id: `drop-${o.id}`, type: 'DROPOFF' as const, location: o.dropoff, name: 'Entrega' }))
  ];

  cityDrivers.forEach(driver => {
    if (driver.currentLocation) {
      mapMarkers.push({ id: driver.id, type: 'DRIVER' as const, location: driver.currentLocation, name: driver.name });
    }
  });

  const getStatusInfo = (status: OrderStatus) => {
    switch(status) {
      case OrderStatus.PENDING_PAYMENT_CONFIRMATION: return { text: "Aguardando Pagamento", color: "bg-yellow-100 text-yellow-800" };
      case OrderStatus.SEARCHING: return { text: "Buscando Entregador", color: "bg-blue-100 text-blue-800" };
      case OrderStatus.ACCEPTED:
      case OrderStatus.PICKUP:
      case OrderStatus.IN_TRANSIT:
        return { text: "Em Rota", color: "bg-orange-100 text-orange-800" };
      case OrderStatus.DELIVERED: return { text: "Entregue", color: "bg-emerald-100 text-emerald-800" };
      case OrderStatus.CANCELED: return { text: "Cancelado", color: "bg-red-100 text-red-800" };
      default: return { text: status, color: "bg-gray-100 text-gray-800" };
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#f7f7f7] font-sans">
      <header className="sticky top-0 bg-white px-6 py-4 flex justify-between items-center border-b border-gray-100 z-[40] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 jaa-gradient rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg font-jaa italic">J</div>
          <div>
            <h2 className="text-sm font-black text-gray-800 uppercase tracking-tighter">{profile.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#0085FF] font-black uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">{profile.city}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsEditingProfile(true)} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-lg shadow-sm">⚙️</button>
          <button onClick={onLogout} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-lg shadow-sm">🚪</button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border-4 border-white h-[320px] relative">
              <MapView markers={mapMarkers} userLocation={safeStoreLocation} radiusKm={profile.deliveryRadius} />
              <div className="absolute top-4 left-4 z-10">
                <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg border border-white/50 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div>
                  <p className="text-[8px] font-black text-gray-800 uppercase tracking-widest">Localização Automática Ativa</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-black text-gray-800 uppercase tracking-widest">Raio de Cobertura</h3>
                  <span className="jaa-gradient text-white text-[10px] px-3 py-1 rounded-full font-bold">{profile.deliveryRadius} KM</span>
                </div>
                <input type="range" min="1" max="30" step="1" value={profile.deliveryRadius} onChange={(e) => onUpdateRadius(parseInt(e.target.value))} className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-[#F84F39]" />
              </div>
              <button onClick={() => setIsRequesting(true)} className="w-full jaa-gradient text-white font-bold py-5 rounded-2xl shadow-xl shadow-red-100 flex items-center justify-center gap-3 active:scale-95 transition-all text-sm uppercase tracking-widest">
                <span className="text-xl">🚀</span> CHAMAR MOTOBOY
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white p-4 rounded-[2.5rem] shadow-sm border border-gray-100">
            <div className="flex border-b border-gray-100 mb-2">
              <button onClick={() => setActiveTab('inProgress')} className={`flex-1 py-3 font-bold text-sm text-center transition-colors ${activeTab === 'inProgress' ? 'text-[#F84F39] border-b-2 border-[#F84F39]' : 'text-gray-400'}`}>
                Em Andamento ({activeOrders.length})
              </button>
              <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 font-bold text-sm text-center transition-colors ${activeTab === 'history' ? 'text-[#F84F39] border-b-2 border-[#F84F39]' : 'text-gray-400'}`}>
                Histórico ({historyOrders.length})
              </button>
            </div>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto p-2">
              {activeTab === 'inProgress' && (
                <>
                  {activeOrders.length === 0 ? (
                    <div className="py-20 text-center">
                      <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Aguardando novo pedido</p>
                    </div>
                  ) : (
                    activeOrders.map(order => (
                      <div key={order.id} className="bg-white border-2 rounded-[2rem] p-5 shadow-lg relative overflow-hidden group transition-all border-white">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">ID #{order.id}</p>
                            <h4 className={`text-sm font-black px-3 py-1 rounded-full inline-block ${getStatusInfo(order.status).color}`}>{getStatusInfo(order.status).text}</h4>
                          </div>
                          <div className="text-right"><span className="text-2xl font-black text-[#F84F39]">R$ {order.price.toFixed(2)}</span></div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl"><div className="text-lg">📍</div><p className="text-xs font-bold text-gray-700 truncate flex-1">{order.dropoff.address}</p></div>
                        <div className="flex gap-2 mt-4">
                          {order.status === OrderStatus.SEARCHING ? <button onClick={() => onCancelOrder(order.id)} className="flex-1 bg-red-50 text-red-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancelar</button> : <div className={`flex-1 ${!order.driverId ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'} py-3 rounded-xl font-black text-[10px] text-center uppercase tracking-widest`}>{!order.driverId ? 'Aguardando' : 'Motoboy em Rota'}</div>}
                          {order.status !== OrderStatus.PENDING_PAYMENT_CONFIRMATION && <div className="bg-gray-800 text-white px-5 py-3 rounded-xl font-black text-lg flex items-center justify-center gap-2"><span className="text-[8px] text-gray-400 uppercase">Cód:</span><span className="text-[#FFB800]">{order.deliveryCode}</span></div>}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
              {activeTab === 'history' && (
                 <>
                  {historyOrders.length === 0 ? (
                    <div className="py-20 text-center">
                      <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Nenhum pedido no histórico</p>
                    </div>
                  ) : (
                    historyOrders.map(order => (
                       <div key={order.id} className="bg-gray-50/50 rounded-2xl p-4 flex justify-between items-center">
                         <div>
                           <p className="text-xs font-bold text-gray-800">Pedido #{order.id} <span className="text-gray-400 font-medium">({formatDateTime(order.timestamp)})</span></p>
                           <h4 className={`text-[10px] font-black px-2 py-0.5 mt-1 rounded-full inline-block ${getStatusInfo(order.status).color}`}>{getStatusInfo(order.status).text}</h4>
                         </div>
                         <span className="text-lg font-black text-gray-600">R$ {order.price.toFixed(2)}</span>
                       </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {isEditingProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl relative border-4 border-white flex flex-col md:flex-row overflow-hidden">
             <button onClick={() => setIsEditingProfile(false)} className="absolute top-6 right-6 text-gray-300 text-xl font-bold z-30 bg-white/80 w-10 h-10 rounded-full shadow-lg flex items-center justify-center">✕</button>
             <div className="w-full md:w-1/2 p-8 space-y-4">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-gray-800 font-jaa italic">Configurações</h2>
                  <div className="flex flex-col items-center">
                    <button onClick={handleUseGps} className="w-10 h-10 jaa-gradient rounded-xl flex items-center justify-center text-white shadow-lg disabled:opacity-50" disabled={isGpsLoading}>
                      {isGpsLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : '🎯'}
                    </button>
                    <span className="text-[6px] font-black text-emerald-500 uppercase mt-1">Sincronizado</span>
                  </div>
                </div>
                <div className="space-y-4">
                   <div className="space-y-1">
                     <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome Fantasia</label>
                     <input type="text" className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm outline-none" value={tempProfile.name} onChange={e => setTempProfile({...tempProfile, name: e.target.value})} />
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">CEP Principal</label>
                        <input type="text" className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm outline-none focus:border-[#F84F39]" value={tempProfile.cep} onChange={e => handleCepLookup(e.target.value)} />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Cidade</label>
                        <input type="text" readOnly className="w-full px-5 py-3 bg-orange-50 text-[#F84F39] rounded-xl font-black text-[10px] uppercase" value={tempProfile.city} />
                     </div>
                   </div>
                   <div className="space-y-1">
                     <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Endereço</label>
                     <input type="text" className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm outline-none" value={tempProfile.address} onChange={e => setTempProfile({...tempProfile, address: e.target.value})} />
                   </div>
                   <button onClick={saveProfile} className="w-full jaa-gradient text-white py-4.5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">SALVAR ALTERAÇÕES</button>
                </div>
             </div>
             <div className="w-full md:w-1/2 h-64 md:h-auto bg-gray-100 relative">
                <div ref={modalMapContainerRef} className="w-full h-full" />
                <div className="absolute bottom-4 left-4 right-4 z-20">
                   <button onClick={handleAutoAdjust} disabled={isAutoAdjusting} className="w-full jaa-gradient text-white py-3 rounded-xl shadow-xl border-2 border-white flex items-center justify-center gap-2 disabled:opacity-50">
                     {isAutoAdjusting ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <span className="text-sm">🪄</span>}
                     <span className="text-[10px] font-black uppercase tracking-widest">Refinar pelo Endereço</span>
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {isRequesting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-2xl border-4 border-white animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-gray-800 font-jaa italic">Nova Entrega Jaa</h2>
              <button onClick={resetRequest} className="p-2 text-gray-300 hover:text-gray-800 font-bold">✕</button>
            </div>
            {paymentStep === 'details' ? (
               <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">CEP Destino</label>
                      <div className="relative">
                        <input type="text" autoFocus placeholder="00000-000" className="w-full px-5 py-4 bg-gray-50 rounded-2xl outline-none font-bold border-2 border-gray-100 focus:border-[#F84F39] text-sm" value={deliveryCep} onChange={(e) => handleDeliveryCepLookup(e.target.value)} />
                        {searchingDeliveryCep && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#F84F39] border-t-transparent rounded-full animate-spin"></div>}
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nº</label>
                      <input type="text" placeholder="123" className="w-full px-5 py-4 bg-gray-50 rounded-2xl outline-none font-bold border-2 border-gray-100 focus:border-[#F84F39] text-sm" value={deliveryNumber} onChange={(e) => setDeliveryNumber(e.target.value)} />
                   </div>
                 </div>
                 {deliveryAddressFound && <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${deliveryAddressFound.includes('não') || deliveryAddressFound.includes('Erro') ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>{deliveryAddressFound}</div>}
                 <button disabled={!deliveryLocation || isCalculating} onClick={handleEstimate} className="w-full jaa-gradient text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl disabled:opacity-30 flex items-center justify-center gap-2">{isCalculating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'CALCULAR VALOR'}</button>
              </div>
            ) : (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-100 text-center space-y-4">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-black mb-1">Valor do Frete</p>
                    <span className="text-[#F84F39] font-black text-4xl">R$ {estimation?.total.toFixed(2)}</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-black mb-1">Chave PIX</p>
                    <p className="text-gray-800 font-mono font-bold text-sm bg-gray-200 p-2 rounded-lg break-all">{settings.pixKey}</p>
                    <button onClick={() => navigator.clipboard.writeText(settings.pixKey)} className="mt-2 text-[10px] font-black text-gray-500 uppercase">COPIAR</button>
                  </div>
                </div>
                {!paymentReceipt ? (
                  <label className="w-full block text-center jaa-gradient text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl cursor-pointer">
                    ENVIAR COMPROVANTE
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                  </label>
                ) : (
                  <div className="text-center">
                    <img src={paymentReceipt} alt="Comprovante" className="rounded-xl mx-auto max-h-40 mb-2 border-2 border-emerald-400 shadow-lg" />
                    <button onClick={createOrder} className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all">FINALIZAR E AGUARDAR APROVAÇÃO</button>
                  </div>
                )}
                <p className="text-center text-[9px] text-gray-400 font-bold uppercase cursor-pointer" onClick={() => setPaymentStep('details')}>Corrigir endereço</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreDashboard;