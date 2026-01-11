import React, { useState, useEffect, useRef } from 'react';
import { Order, OrderStatus, DriverProfile, Location, DriverRegistrationStatus, PlatformSettings, WithdrawalRequest, WithdrawalRequestStatus } from '../types';
import MapView from './MapView';

interface DriverDashboardProps {
  onLogout: () => void;
  availableOrders: Order[];
  activeOrders: Order[];
  allOrders: Order[]; 
  onUpdateStatus: (id: string, status: OrderStatus, driverId?: string) => void;
  balance: number;
  profile: DriverProfile;
  settings: PlatformSettings;
  withdrawalRequests: WithdrawalRequest[];
  onNewWithdrawalRequest: (driverId: string, driverName: string, amount: number) => void;
  onToggleOnline: (driverId: string, isOnline: boolean) => void;
  onUpdateLocation: (driverId: string, location: Location) => void;
  onUpdateProfile: (driverId: string, data: Partial<DriverProfile>) => void;
}

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const DriverDashboard: React.FC<DriverDashboardProps> = ({ 
  onLogout, availableOrders, activeOrders, allOrders, onUpdateStatus, balance, profile, settings, withdrawalRequests, onNewWithdrawalRequest, onToggleOnline, onUpdateLocation, onUpdateProfile 
}) => {
  const isOnline = profile.isOnline || false;
  const activeOrder = activeOrders[0] || null;
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'orders' | 'history'>('orders');
  const [deliveryCodeInput, setDeliveryCodeInput] = useState('');
  
  const [tempProfile, setTempProfile] = useState({
    name: profile.name || '',
    cep: profile.cep || '',
    city: profile.city || '',
    pixKey: profile.pixKey || '',
    currentLocation: profile.currentLocation || { lat: -23.55, lng: -46.63 }
  });

  const cityOrders = availableOrders.filter(o => 
    o.storeCity?.toLowerCase().trim() === profile.city?.toLowerCase().trim()
  );

  const driverHistory = allOrders
    .filter(o => o.driverId === profile.id && o.status === OrderStatus.DELIVERED)
    .sort((a, b) => b.timestamp - a.timestamp);

  const lastAvailableCount = useRef(cityOrders.length);
  const hasPendingWithdrawal = withdrawalRequests.some(r => r.driverId === profile.id && r.status === WithdrawalRequestStatus.PENDING);

  useEffect(() => {
    if (isOnline && cityOrders.length > lastAvailableCount.current) {
      setShowNewOrderAlert(true);
      setTimeout(() => setShowNewOrderAlert(false), 5000);
    }
    lastAvailableCount.current = cityOrders.length;
  }, [cityOrders.length, isOnline]);

  useEffect(() => {
    let watchId: number;
    if (isOnline && profile.status === DriverRegistrationStatus.APPROVED) {
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
            onUpdateLocation(profile.id, newLoc);
            setGpsError(null);
          },
          () => setGpsError("GPS desativado."),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    }
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, [isOnline, profile.id, profile.status, onUpdateLocation]);

  const handleUseGps = () => {
    if (!navigator.geolocation) return;
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setTempProfile(prev => ({ ...prev, currentLocation: { lat: latitude, lng: longitude } }));
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
          const data = await response.json();
          if (data && data.address) {
             setTempProfile(prev => ({
               ...prev,
               city: data.address.city || data.address.town || prev.city,
               cep: (data.address.postcode || '').replace(/\D/g, '').substring(0, 8)
             }));
          }
        } catch (e) {} finally { setIsGpsLoading(false); }
      },
      () => setIsGpsLoading(false),
      { enableHighAccuracy: true }
    );
  };

  const saveProfile = () => {
    onUpdateProfile(profile.id, { city: tempProfile.city, pixKey: tempProfile.pixKey });
    setIsEditingProfile(false);
  };

  const handleStatusUpdate = () => {
    if (!activeOrder) return;
    let nextStatus: OrderStatus | null = null;
    switch (activeOrder.status) {
        case OrderStatus.ACCEPTED: nextStatus = OrderStatus.PICKUP; break;
        case OrderStatus.PICKUP: nextStatus = OrderStatus.IN_TRANSIT; break;
        case OrderStatus.IN_TRANSIT: 
            if (deliveryCodeInput.trim() === activeOrder.deliveryCode) {
                nextStatus = OrderStatus.DELIVERED; 
                setDeliveryCodeInput('');
            } else {
                alert("Código de entrega incorreto!");
            }
            break;
    }
    if (nextStatus) {
        onUpdateStatus(activeOrder.id, nextStatus, profile.id);
    }
  };

  const handleWithdraw = () => {
    if (!profile.pixKey) {
      alert("Por favor, cadastre sua Chave PIX nas configurações antes de solicitar um saque.");
      setIsEditingProfile(true);
      setWithdrawalAmount('');
      return;
    }

    const amount = parseFloat(withdrawalAmount);

    if (isNaN(amount) || amount <= 0) {
      alert("Por favor, insira um valor de saque válido.");
      return;
    }
    if (amount < settings.minimumWithdrawalAmount) {
      alert(`O valor mínimo para saque é de R$${settings.minimumWithdrawalAmount.toFixed(2)}.`);
      return;
    }
    if (amount > balance) {
      alert("Você não pode sacar um valor maior que o seu saldo disponível.");
      return;
    }
    
    onNewWithdrawalRequest(profile.id, profile.name, amount);
    setWithdrawalAmount('');
  };

  const getStatusActionText = (status: OrderStatus) => {
    switch(status) {
        case OrderStatus.ACCEPTED: return "Cheguei para Coletar";
        case OrderStatus.PICKUP: return "Sair para Entrega";
        case OrderStatus.IN_TRANSIT: return "Finalizar Entrega";
        default: return "Atualizar Status";
    }
  };
  
  if (profile.status === DriverRegistrationStatus.PENDING) {
    return <div className="h-screen bg-white flex flex-col items-center justify-center p-8 text-center"><div className="w-16 h-16 jaa-gradient rounded-3xl flex items-center justify-center text-white text-3xl mb-6 shadow-xl">⏳</div><h2 className="text-xl font-bold text-gray-800">Cadastro em Análise</h2><p className="text-gray-500 mt-2">Sua documentação foi recebida e está sendo verificada. Avisaremos assim que o processo for concluído.</p><button onClick={onLogout} className="mt-8 bg-gray-100 text-gray-700 font-bold py-3 px-6 rounded-xl text-sm">Sair</button></div>;
  }
  if (profile.status === DriverRegistrationStatus.REJECTED) {
    return <div className="h-screen bg-white flex flex-col items-center justify-center p-8 text-center"><div className="w-16 h-16 bg-red-100 rounded-3xl flex items-center justify-center text-red-500 text-3xl mb-6">😞</div><h2 className="text-xl font-bold text-gray-800">Cadastro Recusado</h2><p className="text-gray-500 mt-2">Houve um problema com sua documentação. Por favor, entre em contato com o suporte para mais detalhes.</p><button onClick={onLogout} className="mt-8 bg-gray-100 text-gray-700 font-bold py-3 px-6 rounded-xl text-sm">Sair</button></div>;
  }

  const mapMarkers: { id: string; type: 'STORE' | 'DRIVER' | 'DROPOFF'; location: Location; name?: string; }[] = [];
  if (profile.currentLocation) {
    mapMarkers.push({ id: profile.id, type: 'DRIVER', location: profile.currentLocation, name: 'Você' });
  }
  if (activeOrder) {
    mapMarkers.push({ id: 'pickup', type: 'STORE', location: activeOrder.pickup, name: 'Coleta' });
    mapMarkers.push({ id: 'dropoff', type: 'DROPOFF', location: activeOrder.dropoff, name: 'Entrega' });
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#f7f7f7]">
      {showNewOrderAlert && <div className="fixed top-4 left-1/2 -translate-x-1/2 jaa-gradient text-white px-6 py-3 rounded-2xl shadow-lg z-50 animate-bounce">⚡ Nova corrida disponível!</div>}
      <header className="sticky top-0 bg-white px-6 py-4 flex justify-between items-center border-b border-gray-100 z-40 shadow-sm">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg font-jaa italic transition-colors ${isOnline ? 'jaa-gradient' : 'bg-gray-400'}`}>J</div>
          <div><h2 className="text-sm font-black text-gray-800 uppercase tracking-tighter">{profile.name}</h2><span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{profile.city}</span></div>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={isOnline} onChange={() => onToggleOnline(profile.id, !isOnline)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#F84F39]"></div>
          </label>
          <button onClick={() => setIsEditingProfile(true)} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-lg">⚙️</button>
          <button onClick={onLogout} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-lg">🚪</button>
        </div>
      </header>
      
      <div className="fixed top-[88px] left-0 right-0 h-40 bg-white -z-10"></div>
      
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6">
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Atual</p>
            <h3 className="text-3xl font-black text-gray-800">R$ {balance.toFixed(2)}</h3>
          </div>
          
          <div className="space-y-2 pt-4 border-t border-gray-50">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Valor a Sacar</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-300">R$</span>
              <input 
                type="number"
                value={withdrawalAmount}
                onChange={e => setWithdrawalAmount(e.target.value)}
                placeholder="0,00"
                disabled={hasPendingWithdrawal}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl pl-12 pr-4 py-3 text-xl font-black text-gray-800 outline-none focus:border-[#F84F39] disabled:opacity-50"
              />
            </div>
            <p className="text-[10px] font-bold text-gray-400 text-right pr-1">
              Mínimo: R$ {settings.minimumWithdrawalAmount.toFixed(2)}
            </p>
          </div>

          <button 
            onClick={handleWithdraw} 
            disabled={hasPendingWithdrawal || !withdrawalAmount || parseFloat(withdrawalAmount) < settings.minimumWithdrawalAmount || parseFloat(withdrawalAmount) > balance} 
            className="w-full bg-emerald-500 text-white font-black text-sm uppercase tracking-widest px-6 py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {hasPendingWithdrawal ? 'SAQUE PENDENTE' : 'SOLICITAR SAQUE'}
          </button>
        </div>

        {activeOrder ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl border-4 border-white overflow-hidden animate-in fade-in duration-300">
                <div className="h-64"><MapView markers={mapMarkers} userLocation={profile.currentLocation} /></div>
                <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start"><h3 className="text-lg font-bold">Entrega #{activeOrder.id}</h3><span className="text-2xl font-black text-[#F84F39]">R$ {activeOrder.driverEarning.toFixed(2)}</span></div>
                    <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                        <div className="flex items-center gap-3"><div className="text-lg">🏪</div><p className="text-xs font-bold text-gray-600 truncate">{activeOrder.pickup.address}</p></div>
                        <div className="flex items-center gap-3"><div className="text-lg">📍</div><p className="text-xs font-bold text-gray-600 truncate">{activeOrder.dropoff.address}</p></div>
                    </div>
                    {activeOrder.status === OrderStatus.IN_TRANSIT && <input type="text" placeholder="Código de Entrega" value={deliveryCodeInput} onChange={e => setDeliveryCodeInput(e.target.value)} className="w-full text-center tracking-[0.5em] font-black text-xl px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-[#F84F39]" />}
                    <div className="flex gap-2">
                        <a href={`https://www.google.com/maps/dir/?api=1&origin=${profile.currentLocation?.lat},${profile.currentLocation?.lng}&destination=${activeOrder.status === OrderStatus.ACCEPTED ? activeOrder.pickup.lat : activeOrder.dropoff.lat},${activeOrder.status === OrderStatus.ACCEPTED ? activeOrder.pickup.lng : activeOrder.dropoff.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-gray-800 text-white py-4 rounded-xl text-center font-bold text-sm">Maps</a>
                        <a href={`https://waze.com/ul?ll=${activeOrder.status === OrderStatus.ACCEPTED ? activeOrder.pickup.lat : activeOrder.dropoff.lat},${activeOrder.status === OrderStatus.ACCEPTED ? activeOrder.pickup.lng : activeOrder.dropoff.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-blue-500 text-white py-4 rounded-xl text-center font-bold text-sm">Waze</a>
                    </div>
                    <button onClick={handleStatusUpdate} className="w-full jaa-gradient text-white font-bold py-5 rounded-2xl shadow-xl shadow-red-100">{getStatusActionText(activeOrder.status)}</button>
                </div>
            </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-xl border-4 border-white overflow-hidden h-64">
                <MapView markers={mapMarkers} userLocation={profile.currentLocation} />
            </div>
            <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="flex border-b border-gray-100 mb-2">
                <button onClick={() => setActiveTab('orders')} className={`flex-1 py-3 font-bold text-sm text-center transition-colors ${activeTab === 'orders' ? 'text-[#F84F39] border-b-2 border-[#F84F39]' : 'text-gray-400'}`}>Corridas ({cityOrders.length})</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 font-bold text-sm text-center transition-colors ${activeTab === 'history' ? 'text-[#F84F39] border-b-2 border-[#F84F39]' : 'text-gray-400'}`}>Histórico</button>
              </div>
              {activeTab === 'orders' ? (
                  <div className="space-y-3 p-2 max-h-[40vh] overflow-y-auto">
                      {!isOnline ? <p className="text-center text-gray-400 py-10 font-bold text-sm">Fique online para ver corridas.</p> : cityOrders.length === 0 ? <p className="text-center text-gray-400 py-10 font-bold text-sm">Nenhuma corrida na sua cidade.</p> : cityOrders.map(order => (
                          <div key={order.id} className="bg-gray-50 rounded-2xl p-4 flex justify-between items-center">
                              <div><p className="text-xs font-bold">{order.pickup.address} ➔ {order.dropoff.address}</p><p className="text-xs text-gray-500">~{order.distance.toFixed(1)} km</p></div>
                              <button onClick={() => onUpdateStatus(order.id, OrderStatus.ACCEPTED, profile.id)} className="bg-green-500 text-white font-bold px-4 py-2 rounded-lg">R${order.driverEarning.toFixed(2)}</button>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="space-y-3 p-2 max-h-[40vh] overflow-y-auto">
                      {driverHistory.length > 0 ? driverHistory.map(order => (
                           <div key={order.id} className="bg-gray-50 rounded-2xl p-4 flex justify-between items-center">
                              <div><p className="text-xs font-bold">#{order.id}</p><p className="text-xs text-gray-500">{formatDateTime(order.timestamp)}</p></div>
                              <span className="font-bold text-green-600">+ R${order.driverEarning.toFixed(2)}</span>
                           </div>
                      )) : <p className="text-center text-gray-400 py-10 font-bold text-sm">Nenhuma corrida finalizada.</p>}
                  </div>
              )}
            </div>
          </div>
        )}
      </main>

      {isEditingProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-2xl border-4 border-white">
                <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">Configurações</h2><button onClick={() => setIsEditingProfile(false)} className="font-bold text-gray-300">✕</button></div>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500">Sua cidade de atuação</label>
                        <input type="text" value={tempProfile.city} onChange={e => setTempProfile(p => ({ ...p, city: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500">Sua Chave PIX (para saques)</label>
                        <input type="text" placeholder="CPF, e-mail, celular, etc." value={tempProfile.pixKey} onChange={e => setTempProfile(p => ({ ...p, pixKey: e.target.value }))} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg"/>
                    </div>
                    <button onClick={handleUseGps} disabled={isGpsLoading} className="w-full text-sm jaa-gradient text-white py-3 rounded-lg flex items-center justify-center gap-2">
                        {isGpsLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : '📍 Usar GPS para definir cidade'}
                    </button>
                    <button onClick={saveProfile} className="w-full bg-gray-800 text-white font-bold py-4 rounded-lg">Salvar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;