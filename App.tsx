
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserRole, Order, OrderStatus, DriverProfile, DriverRegistrationStatus, StoreProfile, StoreRegistrationStatus, Location, RechargeRequest, RechargeRequestStatus, PlatformSettings, WithdrawalRequest, WithdrawalRequestStatus } from './types';
import StoreDashboard from './components/StoreDashboard';
import DriverDashboard from './components/DriverDashboard';
import AdminDashboard from './components/AdminDashboard';
import DriverRegistration from './components/DriverRegistration';
import StoreRegistration from './components/StoreRegistration';
import { dbService } from './services/database';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [view, setView] = useState<'landing' | 'store-signup' | 'driver-signup'>('landing');
  
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showStoreLogin, setShowStoreLogin] = useState(false);
  const [showDriverLogin, setShowDriverLogin] = useState(false);

  const [loginFields, setLoginFields] = useState({ taxId: '', password: '', user: '', pass: '' });
  const [loginError, setLoginError] = useState('');

  const [globalOrders, setGlobalOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [stores, setStores] = useState<StoreProfile[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(null);
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null);

  const isInternalUpdate = useRef(false);

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    dailyPrice: 10.00,
    monthlyPrice: 180.00,
    pixKey: 'pix@jaadelivery.com',
    minPrice: 7.0,
    pricePerKm: 2.0,
    minimumWithdrawalAmount: 80.0,
    driverEarningModel: 'PERCENTAGE',
    driverEarningPercentage: 85,
    driverEarningFixed: 7.0
  });

  const loadAllData = useCallback(async () => {
    setIsSyncing(true);
    await dbService.init();
    
    const [d, s, o, r, w, settings] = await Promise.all([
      dbService.getDrivers(),
      dbService.getStores(),
      dbService.getOrders(),
      dbService.getRecharges(),
      dbService.getWithdrawals(),
      dbService.getSettings()
    ]);
    
    isInternalUpdate.current = true;
    setDrivers(d || []);
    setStores(s || []);
    setGlobalOrders(o || []);
    setRechargeRequests(r || []);
    setWithdrawalRequests(w || []);
    setPlatformSettings(prev => settings || prev);
    setTimeout(() => { isInternalUpdate.current = false; setIsSyncing(false); }, 100);
  }, []);

  useEffect(() => {
    loadAllData().then(() => {
      const savedSession = localStorage.getItem('jaa_session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          setRole(session.role);
          setCurrentDriverId(session.driverId || null);
          setCurrentStoreId(session.storeId || null);
        } catch (e) {
          localStorage.removeItem('jaa_session');
        }
      }
      setIsLoading(false);
    });

    const unsubscribe = dbService.subscribe(() => {
      if (!isInternalUpdate.current) {
        loadAllData();
      }
    });
    return () => unsubscribe();
  }, [loadAllData]);

  useEffect(() => {
    if (!isLoading && !isInternalUpdate.current) {
      dbService.saveDrivers(drivers);
      dbService.saveStores(stores);
      dbService.saveOrders(globalOrders);
      dbService.saveRecharges(rechargeRequests);
      dbService.saveWithdrawals(withdrawalRequests);
      dbService.saveSettings(platformSettings);
    }
  }, [drivers, stores, globalOrders, rechargeRequests, withdrawalRequests, platformSettings, isLoading]);

  const handleLogin = async (type: 'admin' | 'store' | 'driver') => {
    setIsSyncing(true);
    setLoginError('');
    const inputTaxId = loginFields.taxId.trim().toLowerCase();
    const inputUser = loginFields.user.trim().toLowerCase();
    const inputPass = loginFields.password.trim();
    await new Promise(r => setTimeout(r, 600));

    if ((type === 'driver' || type === 'store') && inputTaxId === 'fabio' && inputPass === '741741') {
        if (type === 'driver') {
            const devDriver: DriverProfile = { id: 'dev-driver', name: 'Fabio Dev (Teste)', taxId: 'fabio', password: '741741', city: 'São Paulo', vehicle: 'Honda CB 500', plate: 'DEV-2024', status: DriverRegistrationStatus.APPROVED, registrationDate: '01/01/2024', balance: 150.00, isOnline: true, email: 'fabio@jaa.com', cep: '01001-000', pixKey: 'fabio@dev.com', currentLocation: { lat: -23.5505, lng: -46.6333 } };
            setDrivers(prev => { const exists = prev.find(d => d.id === devDriver.id); return exists ? prev : [...prev, devDriver]; });
            setCurrentDriverId('dev-driver'); setRole(UserRole.DRIVER); setShowDriverLogin(false); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.DRIVER, driverId: 'dev-driver' }));
        } else {
            const devStore: StoreProfile = { id: 'dev-store', name: 'Restaurante do Fabio', taxId: 'fabio', password: '741741', city: 'São Paulo', address: 'Av. Paulista, 1000', cep: '01310-100', status: StoreRegistrationStatus.APPROVED, registrationDate: '01/01/2024', balance: 500.00, deliveryRadius: 10, accessValidity: Date.now() + 86400000, email: 'loja@jaa.com', location: { lat: -23.5614, lng: -46.6558 } };
            setStores(prev => { const exists = prev.find(s => s.id === devStore.id); return exists ? prev : [...prev, devStore]; });
            setCurrentStoreId('dev-store'); setRole(UserRole.STORE); setShowStoreLogin(false); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.STORE, storeId: 'dev-store' }));
        }
        setIsSyncing(false); return;
    }

    if (type === 'admin') {
      if (inputUser === 'admin' && loginFields.pass === 'fms741741') { setRole(UserRole.ADMIN); setShowAdminLogin(false); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.ADMIN })); } 
      else { setLoginError('Senha incorreta.'); }
    } else if (type === 'driver') {
      const driver = drivers.find(d => d.taxId.trim().toLowerCase() === inputTaxId && d.password === inputPass);
      if (driver) { setCurrentDriverId(driver.id); setRole(UserRole.DRIVER); setShowDriverLogin(false); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.DRIVER, driverId: driver.id })); } 
      else { setLoginError('Dados incorretos.'); }
    } else if (type === 'store') {
      const store = stores.find(s => s.taxId.trim().toLowerCase() === inputTaxId && s.password === inputPass);
      if (store) { setCurrentStoreId(store.id); setRole(UserRole.STORE); setShowStoreLogin(false); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.STORE, storeId: store.id })); } 
      else { setLoginError('Dados incorretos.'); }
    }
    setIsSyncing(false);
  };

  const handleLogout = () => { setRole(null); setCurrentDriverId(null); setCurrentStoreId(null); localStorage.removeItem('jaa_session'); setView('landing'); };

  const handleNewWithdrawalRequest = (driverId: string, driverName: string, amount: number) => {
    const driver = drivers.find(d => d.id === driverId);
    const newRequest: WithdrawalRequest = { 
      id: 'w-' + Math.random().toString(36).substr(2, 9), 
      driverId, 
      driverName, 
      amount, 
      status: WithdrawalRequestStatus.PENDING, 
      requestDate: Date.now(),
      driverPixKey: driver?.pixKey || 'Não informada'
    };
    setWithdrawalRequests(prev => [newRequest, ...prev]);
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, balance: d.balance - amount } : d));
  };

  const handleApproveWithdrawal = (id: string) => { setWithdrawalRequests(prev => prev.map(w => w.id === id ? { ...w, status: WithdrawalRequestStatus.APPROVED } : w)); };

  const handleRejectWithdrawal = (id: string) => {
    const request = withdrawalRequests.find(w => w.id === id);
    if (request) {
      setDrivers(prev => prev.map(d => d.id === request.driverId ? { ...d, balance: d.balance + request.amount } : d));
      setWithdrawalRequests(prev => prev.map(w => w.id === id ? { ...w, status: WithdrawalRequestStatus.REJECTED } : w));
    }
  };

  const handleApprovePayment = (orderId: string) => {
    setGlobalOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: OrderStatus.SEARCHING } : o));
  };

  const handleRejectPayment = (orderId: string) => {
    setGlobalOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: OrderStatus.CANCELED } : o));
  };

  if (isLoading) { return (<div className="h-[100dvh] flex flex-col items-center justify-center bg-white"><div className="w-12 h-12 border-4 border-[#F84F39] border-t-transparent rounded-full animate-spin mb-4"></div><h2 className="jaa-text-gradient font-black text-2xl animate-pulse font-jaa italic">Jaa Delivery</h2></div>); }
  if (view === 'store-signup') { return <StoreRegistration onSignup={(p) => { const newStore: StoreProfile = { ...p, id: 's-' + Math.random().toString(36).substr(2,6), status: StoreRegistrationStatus.PENDING, registrationDate: new Date().toLocaleDateString(), balance: 0, deliveryRadius: 5, accessValidity: 0 }; setStores(prev => [...prev, newStore]); setRole(UserRole.STORE); setCurrentStoreId(newStore.id); setView('landing'); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.STORE, storeId: newStore.id })); }} onBack={() => setView('landing')} />; }
  if (view === 'driver-signup') { return <DriverRegistration onSignup={(p) => { const newDriver: DriverProfile = { ...p, id: 'd-' + Math.random().toString(36).substr(2,6), status: DriverRegistrationStatus.PENDING, registrationDate: new Date().toLocaleDateString(), balance: 0, isOnline: false }; setDrivers(prev => [...prev, newDriver]); setRole(UserRole.DRIVER); setCurrentDriverId(newDriver.id); setView('landing'); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.DRIVER, driverId: newDriver.id })); }} onBack={() => setView('landing')} />; }

  const currentDriver = drivers.find(d => d.id === currentDriverId);
  const currentStore = stores.find(s => s.id === currentStoreId);

  return (
    <div className="bg-[#f7f7f7] min-h-[100dvh]">
      {!role ? (
        <div className="min-h-[100dvh] bg-[#f7f7f7] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-[3.5rem] shadow-2xl p-10 md:p-12 flex flex-col items-center relative overflow-hidden border border-gray-100">
            {isSyncing && <div className="absolute top-0 left-0 right-0 h-1 jaa-gradient animate-pulse"></div>}
            <div className="mb-12 text-center"><h1 className="text-5xl md:text-6xl font-black italic tracking-tighter font-jaa"><span className="text-[#F84F39]">J</span><span className="text-[#FFB800]">a</span><span className="text-[#0085FF]">a</span></h1><p className="text-[#0f172a] text-[12px] font-black uppercase tracking-[0.2em] -mt-1">DELIVERY</p><p className="text-gray-400 text-[10px] font-bold mt-4 uppercase tracking-[0.4em]">Logística Inteligente</p></div>
            <div className="w-full space-y-4"><button onClick={() => setShowStoreLogin(true)} className="w-full jaa-gradient text-white font-black py-5 rounded-2xl shadow-xl shadow-red-100 active:scale-95 transition-all uppercase tracking-widest text-xs">SOU ESTABELECIMENTO</button><button onClick={() => setShowDriverLogin(true)} className="w-full bg-white border-2 border-gray-100 text-gray-800 font-black py-5 rounded-2xl active:scale-95 transition-all uppercase tracking-widest text-xs">SOU ENTREGADOR</button></div>
            <div className="mt-10 pt-8 border-t border-gray-50 w-full text-center"><div className="flex flex-col gap-4"><button onClick={() => setView('store-signup')} className="text-[#F84F39] font-black text-[10px] uppercase tracking-widest">Cadastrar Loja</button><button onClick={() => setView('driver-signup')} className="text-[#0085FF] font-black text-[10px] uppercase tracking-widest">Ser um Parceiro</button></div><button onClick={() => setShowAdminLogin(true)} className="mt-12 text-gray-200 text-[8px] font-black uppercase tracking-widest">Painel ADM</button></div>
          </div>
          {(showAdminLogin || showStoreLogin || showDriverLogin) && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 md:p-10 shadow-2xl relative border-4 border-white">
                <button onClick={() => { setShowAdminLogin(false); setShowStoreLogin(false); setShowDriverLogin(false); setLoginError(''); }} className="absolute top-6 right-6 text-gray-300 text-xl font-bold">✕</button>
                <h2 className="text-2xl font-black text-gray-800 mb-8 tracking-tight font-jaa italic">Acesse sua conta</h2>
                <div className="space-y-4">
                  <input type="text" placeholder={showAdminLogin ? "Usuário" : "Seu Documento"} className="w-full bg-gray-50 border-2 border-gray-100 px-6 py-4.5 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={showAdminLogin ? loginFields.user : loginFields.taxId} onChange={(e) => setLoginFields({ ...loginFields, [showAdminLogin ? 'user' : 'taxId']: e.target.value })} />
                  <input type="password" placeholder="Sua Senha" className="w-full bg-gray-50 border-2 border-gray-100 px-6 py-4.5 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={showAdminLogin ? loginFields.pass : loginFields.password} onChange={(e) => setLoginFields({ ...loginFields, [showAdminLogin ? 'pass' : 'password']: e.target.value })} />
                  {loginError && <p className="text-[#F84F39] text-[10px] font-black text-center">{loginError}</p>}
                  <button onClick={() => handleLogin(showAdminLogin ? 'admin' : showStoreLogin ? 'store' : 'driver')} className="w-full jaa-gradient text-white font-black py-4.5 rounded-2xl shadow-xl mt-4 uppercase tracking-widest text-xs">ENTRAR AGORA</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-[100dvh]">
          {role === UserRole.STORE && ( currentStore ? <StoreDashboard onLogout={handleLogout} orders={globalOrders.filter(o => o.storeId === currentStoreId)} onNewOrder={(o) => setGlobalOrders(prev => [o, ...prev])} onCancelOrder={(id) => setGlobalOrders(prev => prev.filter(ord => ord.id !== id))} onRechargeRequest={(sid, amt) => setRechargeRequests(prev => [{ id: Math.random().toString(36).substr(2,9), storeId: sid, storeName: currentStore.name, amount: amt, status: RechargeRequestStatus.PENDING, requestDate: Date.now() }, ...prev])} profile={currentStore} settings={platformSettings} onlineDrivers={drivers.filter(d => d.isOnline)} onUpdateRadius={(radius) => setStores(prev => prev.map(s => s.id === currentStoreId ? { ...s, deliveryRadius: radius } : s))} onAccessRequest={(id, type) => setStores(prev => prev.map(s => s.id === id ? { ...s, accessValidity: 0, accessRequestType: type } : s))} onUpdateProfile={(id, data) => setStores(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))} /> : <div className="h-[100dvh] flex flex-col items-center justify-center bg-white"><div className="w-12 h-12 border-4 border-[#F84F39] border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sincronizando...</p></div> )}
          {role === UserRole.DRIVER && ( currentDriver ? <DriverDashboard onLogout={handleLogout} availableOrders={globalOrders.filter(o => o.status === OrderStatus.SEARCHING)} activeOrders={globalOrders.filter(o => o.driverId === currentDriverId && o.status !== OrderStatus.DELIVERED)} allOrders={globalOrders} onUpdateStatus={(id, st, did) => { setGlobalOrders(prev => prev.map(o => { if (o.id === id) { if (st === OrderStatus.DELIVERED && did) { setDrivers(prevD => prevD.map(d => d.id === did ? { ...d, balance: d.balance + (o.driverEarning || 0) } : d)); } return { ...o, status: st, driverId: did || o.driverId }; } return o; })); }} balance={currentDriver.balance} profile={currentDriver} settings={platformSettings} withdrawalRequests={withdrawalRequests} onNewWithdrawalRequest={handleNewWithdrawalRequest} onToggleOnline={(id, online) => setDrivers(prev => prev.map(d => d.id === id ? { ...d, isOnline: online } : d))} onUpdateLocation={(id, loc) => setDrivers(prev => prev.map(d => d.id === id ? { ...d, currentLocation: loc } : d))} onUpdateProfile={(id, data) => setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...data } : d))} /> : <div className="h-[100dvh] flex flex-col items-center justify-center bg-white"><div className="w-12 h-12 border-4 border-[#0085FF] border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sincronizando...</p></div> )}
          {role === UserRole.ADMIN && ( <AdminDashboard onLogout={handleLogout} orders={globalOrders} settings={platformSettings} onUpdateSettings={setPlatformSettings} allDrivers={drivers} onApproveDriver={(id) => setDrivers(prev => prev.map(d => d.id === id ? { ...d, status: DriverRegistrationStatus.APPROVED } : d))} onRejectDriver={(id) => setDrivers(prev => prev.map(d => d.id === id ? { ...d, status: DriverRegistrationStatus.REJECTED } : d))} allStores={stores} onApproveStore={(id) => setStores(prev => prev.map(s => s.id === id ? { ...s, status: StoreRegistrationStatus.APPROVED } : s))} onRejectStore={(id) => setStores(prev => prev.map(s => s.id === id ? { ...s, status: StoreRegistrationStatus.REJECTED } : s))} onApproveAccess={(id, type) => { const now = new Date(); const expiry = type === 'DAILY' ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime() : now.getTime() + (30 * 24 * 60 * 60 * 1000); setStores(prev => prev.map(s => s.id === id ? { ...s, accessValidity: expiry, accessRequestType: undefined } : s)); }} rechargeRequests={rechargeRequests} onApproveRecharge={(id) => { const req = rechargeRequests.find(r => r.id === id); if (req) { setStores(prev => prev.map(s => s.id === req.storeId ? { ...s, balance: s.balance + req.amount } : s)); setRechargeRequests(prev => prev.map(r => r.id === id ? { ...r, status: RechargeRequestStatus.APPROVED } : r)); } }} onRejectRecharge={(id) => setRechargeRequests(prev => prev.map(r => r.id === id ? { ...r, status: RechargeRequestStatus.REJECTED } : r))} withdrawalRequests={withdrawalRequests} onApproveWithdrawal={handleApproveWithdrawal} onRejectWithdrawal={handleRejectWithdrawal} onApprovePayment={handleApprovePayment} onRejectPayment={handleRejectPayment} /> )}
        </div>
      )}
    </div>
  );
};

export default App;