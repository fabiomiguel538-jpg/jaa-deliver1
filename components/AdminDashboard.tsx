
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Order, DriverProfile, StoreProfile, DriverRegistrationStatus, StoreRegistrationStatus, RechargeRequest, PlatformSettings, WithdrawalRequest, WithdrawalRequestStatus, OrderStatus, RechargeRequestStatus } from '../types';

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const Icons = {
  dashboard: '📊', store: '🏪', driver: '🏍️', order: '📦', finance: '💳', settings: '⚙️',
  approve: '✅', reject: '❌', view: '👁️', close: '✕', menu: '☰', money: '💵', logistic: '🚚',
  receipt: '🧾', calendar: '📅', wallet: '👛', phone: '📞', whatsapp: '📱', email: '📧',
  plate: '🔢', vehicle: '🛵', password: '🔑', block: '🚫', unblock: '🔓', reset: '🗑️',
  download: '⬇️', zoom: '🔍'
};

const getStatusInfo = (status: OrderStatus) => {
    switch(status) {
      case OrderStatus.PENDING_PAYMENT_CONFIRMATION: return { text: "Aguardando Pagamento", color: "bg-yellow-100 text-yellow-800" };
      case OrderStatus.SEARCHING: return { text: "Buscando Entregador", color: "bg-blue-100 text-blue-800" };
      case OrderStatus.SCHEDULED: return { text: "Agendado", color: "bg-purple-100 text-purple-800" };
      case OrderStatus.ACCEPTED: return { text: "Aceito", color: "bg-orange-100 text-orange-800" };
      case OrderStatus.PICKUP: return { text: "Coleta", color: "bg-orange-200 text-orange-900" };
      case OrderStatus.IN_TRANSIT: return { text: "Em Rota", color: "bg-indigo-100 text-indigo-800" };
      case OrderStatus.DELIVERED: return { text: "Entregue", color: "bg-emerald-100 text-emerald-800" };
      case OrderStatus.CANCELED: return { text: "Cancelado", color: "bg-red-100 text-red-800" };
      default: return { text: status, color: "bg-gray-100 text-gray-800" };
    }
};

const safeNum = (val: any, fallback: number = 0): number => {
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? fallback : n;
};

type DateFilter = 'day' | 'week' | 'month' | 'all';

const filterOrdersByDate = (orders: Order[], filter: DateFilter): Order[] => {
  const now = new Date();
  if (filter === 'all') return orders;
  return orders.filter(order => {
    const orderDate = new Date(order.timestamp);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (filter === 'day') return orderDate >= today;
    if (filter === 'week') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return orderDate >= weekStart;
    }
    if (filter === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return orderDate >= monthStart;
    }
    return true;
  });
};

interface AdminDashboardProps {
  onLogout: () => void;
  orders: Order[];
  settings: PlatformSettings;
  onUpdateSettings: (settings: PlatformSettings) => void;
  allDrivers: DriverProfile[];
  onApproveDriver: (id: string) => void;
  onRejectDriver: (id: string) => void;
  onDeleteDriver: (id: string) => void;
  allStores: StoreProfile[];
  onApproveStore: (id: string) => void;
  onRejectStore: (id: string) => void;
  onDeleteStore: (id: string) => void;
  onApproveAccess: (id: string, type: 'DAILY' | 'MONTHLY') => void;
  rechargeRequests: RechargeRequest[];
  onApproveRecharge: (id: string) => void;
  onRejectRecharge: (id: string) => void;
  withdrawalRequests: WithdrawalRequest[];
  onApproveWithdrawal: (id: string) => void;
  onRejectWithdrawal: (id: string) => void;
  onApprovePayment: (id: string) => void;
  onRejectPayment: (id: string) => void;
  onUpdateDriver: (id: string, data: Partial<DriverProfile>) => void;
  onUpdateStore: (id: string, data: Partial<StoreProfile>) => void;
  onResetStatistics: () => void;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  onRefresh: () => void;
}

const NavButton = ({ onClick, isActive, icon, label, notificationCount }: { onClick: () => void; isActive: boolean; icon: string; label: string; notificationCount?: number; }) => (
    <button onClick={onClick} className={`flex items-center gap-4 w-full text-left px-6 py-4 rounded-2xl transition-all ${isActive ? 'bg-[#F84F39] text-white shadow-lg' : 'hover:bg-gray-100 text-gray-700'}`}>
      <span className="text-2xl">{icon}</span>
      <span className="font-bold text-sm flex-1">{label}</span>
      {notificationCount !== undefined && notificationCount > 0 && <span className={`w-6 h-6 flex items-center justify-center text-xs font-black rounded-full ${isActive ? 'bg-white text-[#F84F39]' : 'bg-[#F84F39] text-white'}`}>{notificationCount}</span>}
    </button>
);

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  onLogout, orders, settings, onUpdateSettings, allDrivers, onApproveDriver, onRejectDriver, onDeleteDriver, allStores, onApproveStore, onRejectStore, onDeleteStore, onApproveAccess, rechargeRequests, onApproveRecharge, onRejectRecharge, withdrawalRequests, onApproveWithdrawal, onRejectWithdrawal, onApprovePayment, onRejectPayment, onUpdateDriver, onUpdateStore, onResetStatistics, isSyncing, lastSyncTime, onRefresh
}) => {
  const [view, setView] = useState('dashboard');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [tempSettings, setTempSettings] = useState<PlatformSettings>(settings);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedRechargeId, setSelectedRechargeId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [storeCreditAmount, setStoreCreditAmount] = useState<string>('');
  const [timeAgo, setTimeAgo] = useState('...');
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(() => {
    setZoomScale(1);
  }, [enlargedImageUrl]);

  useEffect(() => {
    const update = () => {
        if (!lastSyncTime) {
            setTimeAgo('nunca');
            return;
        }
        const seconds = Math.floor((new Date().getTime() - lastSyncTime.getTime()) / 1000);
        if (seconds < 5) setTimeAgo('agora');
        else if (seconds < 60) setTimeAgo(`há ${seconds} seg`);
        else setTimeAgo(`há ${Math.floor(seconds / 60)} min`);
    };
    
    update();
    const intervalId = setInterval(update, 5000); // update every 5 seconds
    return () => clearInterval(intervalId);
  }, [lastSyncTime]);

  const selectedDriver = selectedDriverId ? allDrivers.find(d => d.id === selectedDriverId) : null;
  const selectedStore = selectedStoreId ? allStores.find(s => s.id === selectedStoreId) : null;
  const selectedOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null;
  const selectedRecharge = selectedRechargeId ? rechargeRequests.find(r => r.id === selectedRechargeId) : null;

  const pendingPayments = useMemo(() => orders.filter(o => o.status === OrderStatus.PENDING_PAYMENT_CONFIRMATION), [orders]);
  const pendingWithdrawals = useMemo(() => withdrawalRequests.filter(w => w.status === WithdrawalRequestStatus.PENDING), [withdrawalRequests]);
  const pendingRecharges = useMemo(() => rechargeRequests.filter(r => r.status === RechargeRequestStatus.PENDING), [rechargeRequests]);
  const pendingAccess = useMemo(() => allStores.filter(s => !!s.paymentProofUrl), [allStores]);
  const pendingDrivers = useMemo(() => allDrivers.filter(d => d.status === DriverRegistrationStatus.PENDING), [allDrivers]);
  const pendingStores = useMemo(() => allStores.filter(s => s.status === StoreRegistrationStatus.PENDING), [allStores]);
  const filteredOrders = useMemo(() => filterOrdersByDate(orders, dateFilter), [orders, dateFilter]);

  const handleNavClick = (targetView: string) => {
    setView(targetView);
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  const handleSaveSettings = () => {
    onUpdateSettings(tempSettings);
    alert('Configurações salvas com sucesso!');
  };

  const handleDownloadImage = async (url: string, fileName: string) => {
    if (!url) {
      alert('A imagem não está disponível para download.');
      return;
    }

    try {
      if (url.startsWith('data:image')) {
        // Se for base64, faz o download direto
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Se for URL externa, usa fetch e Blob para forçar o download
        const response = await fetch(url);
        if (!response.ok) throw new Error('Erro ao baixar a imagem');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Limpa a URL do Blob da memória
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('Erro no download:', error);
      alert('Não foi possível fazer o download da imagem. Tente abrir em uma nova aba.');
    }
  };

  const handleResetClick = async () => {
    const password = prompt('Para zerar todas as estatísticas e histórico de pedidos, insira a senha:');
    if (password === 'Fms741741') {
      if (confirm('Atenção: Todos os dados de pedidos serão removidos permanentemente do banco de dados. Continuar?')) {
        await onResetStatistics(); // Aguarda a confirmação real do banco de dados
      }
    } else if (password !== null) {
      alert('Senha incorreta.');
    }
  };

  const handleToggleBlockDriver = () => {
    if (!selectedDriver) return;
    if (selectedDriver.isBlocked) {
      onUpdateDriver(selectedDriver.id, { isBlocked: false, blockReason: '' });
    } else {
      const reason = prompt('Por favor, insira o motivo do bloqueio para este motoboy:');
      if (reason) {
        onUpdateDriver(selectedDriver.id, { isBlocked: true, blockReason: reason });
      }
    }
  };

  const handleToggleBlockStore = () => {
    if (!selectedStore) return;
    if (selectedStore.isBlocked) {
      onUpdateStore(selectedStore.id, { isBlocked: false, blockReason: '' });
    } else {
      const reason = prompt('Por favor, insira o motivo do bloqueio para esta loja:');
      if (reason) {
        onUpdateStore(selectedStore.id, { isBlocked: true, blockReason: reason });
      }
    }
  };

  const handleAddStoreCredit = (store: StoreProfile) => {
    const amount = parseFloat(storeCreditAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Por favor, insira um valor numérico válido maior que zero.');
      return;
    }
    const newBalance = (store.balance || 0) + amount;
    onUpdateStore(store.id, { balance: newBalance });
    setStoreCreditAmount('');
    alert(`Crédito de R$ ${amount.toFixed(2)} adicionado com sucesso!`);
  };

  const handleRemoveStoreCredit = (store: StoreProfile) => {
    const amount = parseFloat(storeCreditAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Por favor, insira um valor numérico válido maior que zero.');
      return;
    }
    const newBalance = (store.balance || 0) - amount;
    onUpdateStore(store.id, { balance: newBalance });
    setStoreCreditAmount('');
    alert(`Crédito de R$ ${amount.toFixed(2)} removido com sucesso!`);
  };

  const handleSettingsChange = (field: keyof PlatformSettings, value: any) => {
    const numericFields: (keyof PlatformSettings)[] = ['dailyPrice', 'monthlyPrice', 'minPrice', 'pricePerKm', 'kmFranchise', 'minimumWithdrawalAmount', 'driverEarningPercentage', 'driverEarningFixed', 'returnFeeAmount'];
    if (numericFields.includes(field)) {
        const numericValue = parseFloat(value);
        setTempSettings(prev => ({...prev, [field]: isNaN(numericValue) ? 0 : numericValue}));
    } else {
        setTempSettings(prev => ({...prev, [field]: value}));
    }
  };

  const stats = useMemo(() => {
    const paidOrders = filteredOrders.filter(o => o.status !== OrderStatus.PENDING_PAYMENT_CONFIRMATION && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.SCHEDULED);
    const grossRevenue = paidOrders.reduce((acc, o) => acc + (o.price || 0), 0);
    const driverCosts = paidOrders.reduce((acc, o) => acc + (o.driverEarning || 0), 0);
    const completedOrdersCount = filteredOrders.filter(o => o.status === OrderStatus.DELIVERED).length;
    
    return {
      totalOrders: filteredOrders.length,
      onlineDrivers: allDrivers.filter(d => d.isOnline).length,
      grossRevenue,
      netProfit: grossRevenue - driverCosts,
      averageTicket: paidOrders.length > 0 ? grossRevenue / paidOrders.length : 0,
      completedOrders: completedOrdersCount,
      totalDrivers: allDrivers.filter(d => d.status === DriverRegistrationStatus.APPROVED).length,
      totalStores: allStores.filter(s => s.status === StoreRegistrationStatus.APPROVED).length
    };
  }, [filteredOrders, allDrivers, allStores]);
  
  const pendingTotal = pendingDrivers.length + pendingStores.length + pendingPayments.length + pendingWithdrawals.length + pendingAccess.length + pendingRecharges.length;

  const revenueData = useMemo(() => {
      const getGroupKey = (timestamp: number) => {
          const date = new Date(timestamp);
          if (dateFilter === 'day') return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          if (dateFilter === 'week') return date.toLocaleDateString('pt-BR', { weekday: 'short' });
          if (dateFilter === 'month') return date.toLocaleDateString('pt-BR', { day: '2-digit' });
          return date.toLocaleDateString('pt-BR', { month: 'short' });
      };
      const grouped = filteredOrders.reduce((acc, order) => {
          const key = getGroupKey(order.timestamp);
          if (!acc[key]) acc[key] = { name: key, 'Bruto': 0, 'Líquido': 0 };
          const isPaid = order.status !== OrderStatus.PENDING_PAYMENT_CONFIRMATION && order.status !== OrderStatus.CANCELED && order.status !== OrderStatus.SCHEDULED;
          if(isPaid){
              acc[key]['Bruto'] += order.price;
              acc[key]['Líquido'] += (order.price - order.driverEarning);
          }
          return acc;
      }, {} as Record<string, any>);
      return Object.values(grouped);
  }, [filteredOrders, dateFilter]);
  
  const orderStatusData = useMemo(() => {
      const statusCounts = filteredOrders.reduce((acc, order) => {
          const statusName = getStatusInfo(order.status).text;
          acc[statusName] = (acc[statusName] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);
      return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const InfoCard = ({ label, value, icon }: { label: string, value: string | number | undefined, icon: string }) => (
    <div className="bg-gray-50 p-4 rounded-xl flex items-center gap-3">
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg shadow-sm">{icon}</div>
      <div>
        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-black text-gray-800">{value || 'N/A'}</p>
      </div>
    </div>
  );
  
  const KpiCard = ({ title, value, icon, colorClass = 'text-gray-800' }: { title: string, value: string | number, icon: string, colorClass?: string }) => (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-50 mb-4 text-2xl">{icon}</div>
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{title}</p>
        <p className={`text-3xl font-black ${colorClass}`}>{value}</p>
    </div>
  );

  const renderContent = () => {
    switch(view) {
      case 'dashboard': 
        const PIE_COLORS: Record<string, string> = {
            [getStatusInfo(OrderStatus.DELIVERED).text]: '#22c55e', [getStatusInfo(OrderStatus.CANCELED).text]: '#ef4444',
            [getStatusInfo(OrderStatus.IN_TRANSIT).text]: '#6366f1', [getStatusInfo(OrderStatus.SEARCHING).text]: '#3b82f6',
            [getStatusInfo(OrderStatus.PENDING_PAYMENT_CONFIRMATION).text]: '#f59e0b', [getStatusInfo(OrderStatus.ACCEPTED).text]: '#f97316',
            [getStatusInfo(OrderStatus.PICKUP).text]: '#f97316',
            [getStatusInfo(OrderStatus.SCHEDULED).text]: '#8b5cf6',
        };

        return (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
               <div className="flex items-center gap-4">
                  <h3 className="text-2xl font-black text-gray-800 italic tracking-tight font-jaa">Painel Executivo</h3>
                  {/* Botão de atualização manual oculto conforme solicitação (atualização automática em background)
                  <button 
                    onClick={onRefresh}
                    disabled={isSyncing}
                    className="bg-blue-50 text-blue-500 hover:bg-blue-100 p-2.5 rounded-xl transition-all shadow-sm border border-blue-100 flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    title="Atualizar Dados"
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest">{isSyncing ? 'Atualizando...' : 'Atualizar'}</span>
                  </button>
                  */}
                  <button 
                    onClick={handleResetClick}
                    className="bg-red-50 text-red-500 hover:bg-red-100 p-2.5 rounded-xl transition-all shadow-sm border border-red-100 flex items-center gap-2 active:scale-95"
                    title="Zerar Estatísticas"
                  >
                    <span className="text-lg">{Icons.reset}</span>
                  </button>
               </div>
               <div className="flex bg-gray-100 p-1 rounded-2xl">
                 {(['day', 'week', 'month', 'all'] as DateFilter[]).map(f => (
                   <button key={f} onClick={() => setDateFilter(f)} className={`px-4 py-2 text-xs font-black uppercase rounded-xl transition-all ${dateFilter === f ? 'bg-white text-[#F84F39] shadow' : 'text-gray-500'}`}>{f === 'day' ? 'Hoje' : f === 'week' ? 'Semana' : f === 'month' ? 'Mês' : 'Geral'}</button>
                 ))}
               </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <KpiCard title="Entrada Bruta" value={`R$ ${stats.grossRevenue.toFixed(2)}`} icon="💰" colorClass="text-gray-800" />
              <KpiCard title="Lucro Líquido" value={`R$ ${stats.netProfit.toFixed(2)}`} icon="💸" colorClass="text-[#F84F39]" />
              <KpiCard title="Ticket Médio" value={`R$ ${stats.averageTicket.toFixed(2)}`} icon="🏷️" colorClass="text-blue-500" />
              <KpiCard title="Corridas Finalizadas" value={stats.completedOrders} icon="🏁" colorClass="text-emerald-500" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border h-96"><h4 className="font-bold mb-4">Receita ({dateFilter})</h4><ResponsiveContainer width="100%" height="100%"><BarChart data={revenueData} margin={{ top: 5, right: 20, left: -20, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} tickFormatter={(v) => `R$${v}`} /><Tooltip formatter={(v:number) => `R$ ${v.toFixed(2)}`} /><Legend /><Bar dataKey="Bruto" fill="#cccccc" radius={[10, 10, 0, 0]} /><Bar dataKey="Líquido" fill="#F84F39" radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border h-96"><h4 className="font-bold mb-4">Status dos Pedidos</h4><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip /><Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>{orderStatusData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || '#8884d8'} />)}</Pie></PieChart></ResponsiveContainer></div>
            </div>
            <div>
               <h4 className="font-bold text-lg mb-4">Ações Pendentes ({pendingTotal})</h4>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {pendingDrivers.length > 0 && <button onClick={() => setView('motoboys')} className="bg-orange-50 text-orange-600 p-4 rounded-2xl text-left font-bold">{pendingDrivers.length} Motoboys para Aprovar</button>}
                  {pendingStores.length > 0 && <button onClick={() => setView('lojas')} className="bg-blue-50 text-blue-600 p-4 rounded-2xl text-left font-bold">{pendingStores.length} Lojas para Aprovar</button>}
                  {pendingPayments.length > 0 && <button onClick={() => setView('pedidos')} className="bg-yellow-50 text-yellow-600 p-4 rounded-2xl text-left font-bold">{pendingPayments.length} Pagamentos para Validar</button>}
                  {pendingWithdrawals.length > 0 && <button onClick={() => setView('financeiro')} className="bg-red-50 text-red-600 p-4 rounded-2xl text-left font-bold">{pendingWithdrawals.length} Saques para Pagar</button>}
                  {pendingRecharges.length > 0 && <button onClick={() => setView('financeiro')} className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-left font-bold">{pendingRecharges.length} Recargas para Aprovar</button>}
               </div>
            </div>
          </div>
        );
      case 'motoboys': return (<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500"><div><h3 className="font-bold text-lg mb-4">Aguardando ({pendingDrivers.length})</h3><div className="space-y-4">{pendingDrivers.map(d => (<div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center"><div><p className="font-bold">{d.name}</p><p className="text-xs text-gray-500">{d.city}</p></div><button onClick={() => { setSelectedDriverId(d.id); setEditPassword(d.password || ''); }} className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">{Icons.view}</button></div>))}</div></div><div><h3 className="font-bold text-lg mb-4">Aprovados ({allDrivers.filter(d => d.status === DriverRegistrationStatus.APPROVED).length})</h3><div className="space-y-4 max-h-[60vh] overflow-y-auto">{allDrivers.filter(d => d.status === DriverRegistrationStatus.APPROVED).map(d => (<div key={d.id} className={`bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center ${d.isBlocked ? 'border-red-300' : ''}`}><div><p className="font-bold">{d.name} {d.isBlocked && <span className="text-red-500 text-xs">(Bloqueado)</span>}</p><p className="text-xs text-gray-500">{d.isOnline ? 'Online' : 'Offline'}</p></div><button onClick={() => { setSelectedDriverId(d.id); setEditPassword(d.password || ''); }} className="w-10 h-10 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center">{Icons.view}</button></div>))}</div></div></div>);
      case 'lojas': return (<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500"><div><h3 className="font-bold text-lg mb-4">Aguardando ({pendingStores.length})</h3><div className="space-y-4">{pendingStores.map(s => (<div key={s.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center"><div><p className="font-bold">{s.name}</p></div><button onClick={() => { setSelectedStoreId(s.id); setEditPassword(s.password || ''); }} className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">{Icons.view}</button></div>))}</div></div><div><h3 className="font-bold text-lg mb-4">Ativas ({allStores.filter(s => s.status === StoreRegistrationStatus.APPROVED).length})</h3><div className="space-y-4 max-h-[60vh] overflow-y-auto">{allStores.filter(s => s.status === StoreRegistrationStatus.APPROVED).map(s => (<div key={s.id} className={`bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center ${s.isBlocked ? 'border-red-300' : ''}`}><div><p className="font-bold">{s.name} {s.isBlocked && <span className="text-red-500 text-xs">(Bloqueada)</span>}</p><p className="text-xs text-gray-500">{s.city}</p></div><button onClick={() => { setSelectedStoreId(s.id); setEditPassword(s.password || ''); }} className="w-10 h-10 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center">{Icons.view}</button></div>))}</div></div></div>);
      case 'financeiro': return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
            <div>
                <h3 className="font-bold text-lg mb-4">Saques Pendentes (Motoboys) ({pendingWithdrawals.length})</h3>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                    {pendingWithdrawals.map(w => (
                        <div key={w.id} className="bg-white p-4 rounded-2xl shadow-sm border space-y-3">
                            <div>
                                <p className="font-bold text-sm">{w.driverName}</p>
                                <p className="font-black text-lg text-red-500">R$ {w.amount.toFixed(2)}</p>
                                <p className="text-xs text-gray-500">PIX: {w.driverPixKey || 'Não cadastrado'}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => onApproveWithdrawal(w.id)} className="flex-1 bg-emerald-100 text-emerald-600 py-2 rounded-lg text-xs font-bold">{Icons.approve} PAGO</button>
                                <button onClick={() => onRejectWithdrawal(w.id)} className="flex-1 bg-red-100 text-red-600 py-2 rounded-lg text-xs font-bold">{Icons.reject} RECUSAR</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-8">
                <div>
                    <h3 className="font-bold text-lg mb-4">Recargas Pendentes (Lojas) ({pendingRecharges.length})</h3>
                    <div className="space-y-4 max-h-[40vh] overflow-y-auto">
                        {pendingRecharges.map(r => (
                            <div key={r.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-sm">{r.storeName}</p>
                                    <p className="font-black text-emerald-600">R$ {r.amount.toFixed(2)}</p>
                                </div>
                                <button onClick={() => setSelectedRechargeId(r.id)} className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">{Icons.receipt}</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg mb-4">Acessos Pendentes (Lojas) ({pendingAccess.length})</h3>
                    <div className="space-y-4 max-h-[40vh] overflow-y-auto">
                        {pendingAccess.map(s => (
                            <div key={s.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{s.name}</p>
                                    <p className="text-xs text-gray-500">{s.accessRequestType}</p>
                                </div>
                                <button onClick={() => { setSelectedStoreId(s.id); setEditPassword(s.password || ''); }} className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">{Icons.receipt}</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      );
      case 'pedidos': return (<div><h3 className="font-bold text-lg mb-4">Validação de Pagamentos ({pendingPayments.length})</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{pendingPayments.map(order => (<div key={order.id} className="bg-white p-4 rounded-2xl shadow-sm border space-y-3"><div><p className="font-bold text-sm">Pedido #{order.id}</p><p className="text-xs text-gray-500">{allStores.find(s => s.id === order.storeId)?.name}</p><p className="font-black text-lg text-[#F84F39]">R$ {(order.price || 0).toFixed(2)}</p></div><button onClick={() => setSelectedOrderId(id => order.id)} className="w-full bg-blue-100 text-blue-600 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2">{Icons.receipt} VER COMPROVANTE</button></div>))}</div></div>);
      case 'settings': return (<div className="bg-white p-8 rounded-[3rem] shadow-sm border max-w-4xl mx-auto space-y-10 animate-in slide-in-from-bottom-4 duration-500 pb-12"><div className="flex items-center gap-4"><div className="w-12 h-12 jaa-gradient rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">⚙️</div><div><h3 className="text-2xl font-black text-gray-800 tracking-tight">Configurações do Sistema</h3></div></div><div className="space-y-6"><h4 className="text-sm font-black uppercase tracking-wider text-gray-500 border-b pb-2">Geral</h4><div className="space-y-4"><div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Chave PIX Administrador</label><input type="text" value={tempSettings.pixKey ?? ''} onChange={e => handleSettingsChange('pixKey', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" /></div><div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Suporte (Esqueci Senha)</label><input type="text" placeholder="Ex: 5511999999999" value={tempSettings.supportWhatsapp ?? ''} onChange={e => handleSettingsChange('supportWhatsapp', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" /></div></div><h4 className="text-sm font-black uppercase tracking-wider text-gray-500 border-b pb-2 pt-6">Precificação Padrão</h4>
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className="space-y-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço Mínimo (R$)</label>
        <input type="number" step="0.01" value={safeNum(tempSettings.minPrice)} onChange={e => handleSettingsChange('minPrice', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
    </div>
    <div className="space-y-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço por KM (R$)</label>
        <input type="number" step="0.01" value={safeNum(tempSettings.pricePerKm)} onChange={e => handleSettingsChange('pricePerKm', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
    </div>
    <div className="space-y-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Franquia de KM</label>
        <input type="number" step="0.1" value={safeNum(tempSettings.kmFranchise)} onChange={e => handleSettingsChange('kmFranchise', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
    </div>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="space-y-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço Diário (R$)</label>
        <input type="number" step="0.01" value={safeNum(tempSettings.dailyPrice)} onChange={e => handleSettingsChange('dailyPrice', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
    </div>
    <div className="space-y-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço Mensal (R$)</label>
        <input type="number" step="0.01" value={safeNum(tempSettings.monthlyPrice)} onChange={e => handleSettingsChange('monthlyPrice', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
    </div>
</div>
<div className="space-y-1">
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Valor Mínimo para Saque (R$)</label>
    <input type="number" step="0.01" value={safeNum(tempSettings.minimumWithdrawalAmount)} onChange={e => handleSettingsChange('minimumWithdrawalAmount', e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
</div>
</div><button onClick={handleSaveSettings} className="w-full jaa-gradient text-white font-black py-6 rounded-[2rem] shadow-xl uppercase tracking-widest text-xs mt-12">SALVAR TODAS AS CONFIGURAÇÕES</button></div>);
      default: return <div>Selecione uma opção</div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <aside className={`w-72 bg-white p-6 border-r border-gray-200 flex flex-col fixed h-full z-40 transition-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-start gap-3 mb-12">
          <div className="w-12 h-12 jaa-gradient rounded-2xl flex items-center justify-center text-white font-black text-xl font-jaa italic flex-shrink-0">J</div>
          <div className="flex-1">
            <h1 className="text-lg font-black tracking-tighter">JAADelivery</h1>
            <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${lastSyncTime ? 'opacity-100' : 'opacity-0'}`}>
                {/* Indicador de sincronização oculto conforme solicitado */}
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-2">
           <NavButton onClick={() => handleNavClick('dashboard')} isActive={view === 'dashboard'} icon={Icons.dashboard} label="Resumo Geral" />
           <NavButton onClick={() => handleNavClick('pedidos')} isActive={view === 'pedidos'} icon={Icons.order} label="Pedidos" notificationCount={pendingPayments.length} />
           <NavButton onClick={() => handleNavClick('financeiro')} isActive={view === 'financeiro'} icon={Icons.finance} label="Financeiro" notificationCount={pendingWithdrawals.length + pendingAccess.length + pendingRecharges.length} />
           <NavButton onClick={() => handleNavClick('lojas')} isActive={view === 'lojas'} icon={Icons.store} label="Lojas" notificationCount={pendingStores.length} />
           <NavButton onClick={() => handleNavClick('motoboys')} isActive={view === 'motoboys'} icon={Icons.driver} label="Motoboys" notificationCount={pendingDrivers.length} />
           <NavButton onClick={() => handleNavClick('settings')} isActive={view === 'settings'} icon={Icons.settings} label="Configurações" />
        </nav>
        <button onClick={onLogout} className="mt-8 w-full text-left px-6 py-3 text-gray-400 font-bold hover:bg-red-50 hover:text-red-500 rounded-2xl transition-colors text-xs uppercase tracking-widest">Sair</button>
      </aside>

      <div className="flex-1 lg:ml-72 flex flex-col">
        <header className="bg-white border-b px-10 py-5 flex justify-between items-center lg:hidden">
           <button onClick={() => setIsSidebarOpen(true)} className="text-2xl text-gray-600">{Icons.menu}</button>
           <h1 className="font-jaa font-black italic text-xl">Admin</h1>
        </header>
        <main className="flex-1 p-6 md:p-12 overflow-y-auto w-full">{renderContent()}</main>
      </div>

      {selectedDriver && (<div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4"><div className="bg-white w-full max-w-4xl rounded-[3rem] p-8 shadow-2xl relative border-4 border-white max-h-[90vh] overflow-y-auto animate-in zoom-in-95"><button onClick={() => setSelectedDriverId(null)} className="absolute top-6 right-6 text-gray-300 text-xl font-bold">✕</button><h2 className="text-2xl font-black text-gray-800 mb-6 font-jaa italic flex items-center gap-3">{Icons.driver} Dados do Motoboy</h2><div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><InfoCard label="Nome" value={selectedDriver.name} icon="👤" /><InfoCard label="CPF" value={selectedDriver.taxId} icon="🆔" /><InfoCard label="Email" value={selectedDriver.email} icon={Icons.email} /><InfoCard label="WhatsApp" value={selectedDriver.whatsapp} icon={Icons.whatsapp} /><InfoCard label="Cidade" value={selectedDriver.city} icon="🏙️" /><InfoCard label="Status" value={selectedDriver.status} icon="🚦" /><InfoCard label="Veículo" value={selectedDriver.vehicle} icon={Icons.vehicle} /><InfoCard label="Placa" value={selectedDriver.plate} icon={Icons.plate} /><InfoCard label="Saldo" value={`R$ ${(selectedDriver.balance || 0).toFixed(2)}`} icon={Icons.wallet} /></div>{selectedDriver.isBlocked && (<div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-bold"><strong>Usuário Bloqueado.</strong> Motivo: {selectedDriver.blockReason}</div>)}<div className="bg-gray-50 p-4 rounded-2xl"><p className="text-[8px] font-black text-gray-400 uppercase mb-2">Segurança: Senha do Usuário</p><div className="flex gap-2"><input type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} className="flex-1 bg-white border border-gray-200 px-4 py-2 rounded-lg font-bold text-sm" /><button onClick={() => { onUpdateDriver(selectedDriver.id, { password: editPassword }); alert('Senha atualizada!'); }} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase">{Icons.password} Alterar</button></div></div><div><h3 className="text-sm font-bold my-4">Documentos Enviados</h3><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{url: selectedDriver.licenseImageUrl, name: 'cnh'}, {url: selectedDriver.selfieWithLicenseUrl, name: 'selfie-cnh'}, {url: selectedDriver.vehiclePhotoUrl1, name: 'moto-frente'}, {url: selectedDriver.vehiclePhotoUrl2, name: 'moto-placa'}].map(({url, name}, i) => (url ? <div key={i} className="relative group w-full aspect-square"><img src={url} className="w-full h-full object-cover rounded-xl border-2 border-white shadow-lg" alt={`doc-${i}`} /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl gap-4"><button onClick={() => setEnlargedImageUrl(url)} className="w-12 h-12 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-2xl text-gray-800 hover:scale-110 transition-transform active:scale-95" title="Ampliar Imagem">{Icons.zoom}</button><button onClick={() => handleDownloadImage(url, `${selectedDriver?.taxId}-${name}.png`)} className="w-12 h-12 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-2xl text-gray-800 hover:scale-110 transition-transform active:scale-95" title="Baixar Imagem">{Icons.download}</button></div></div> : <div key={i} className="w-full aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-xs text-gray-400">N/A</div>))}</div></div></div>
        {selectedDriver.status === DriverRegistrationStatus.PENDING ? (
          <div className="flex gap-4 mt-8">
            <button onClick={() => { onApproveDriver(selectedDriver.id); setSelectedDriverId(null); }} className="flex-1 jaa-gradient text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg">{Icons.approve} Aprovar</button>
            <button onClick={() => { onRejectDriver(selectedDriver.id); setSelectedDriverId(null); }} className="flex-1 bg-red-100 text-red-500 font-black py-4 rounded-xl text-xs uppercase tracking-widest">{Icons.reject} Recusar</button>
          </div>
        ) : (
          <div className="flex gap-4 mt-8">
            <button onClick={handleToggleBlockDriver} className={`flex-1 font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 ${selectedDriver.isBlocked ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>{selectedDriver.isBlocked ? Icons.unblock : Icons.block} {selectedDriver.isBlocked ? 'Desbloquear' : 'Bloquear'}</button>
            <button onClick={() => { if (window.confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE o motoboy ${selectedDriver.name}? Esta ação não pode ser desfeita.`)) { onDeleteDriver(selectedDriver.id); setSelectedDriverId(null); } }} className="bg-red-500 text-white font-black px-6 py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                {Icons.reset} Excluir
            </button>
          </div>
        )}
      </div></div>)}
      {selectedStore && (<div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4"><div className="bg-white w-full max-w-4xl rounded-[3rem] p-8 shadow-2xl relative border-4 border-white max-h-[90vh] overflow-y-auto animate-in zoom-in-95"><button onClick={() => setSelectedStoreId(null)} className="absolute top-6 right-6 text-gray-300 text-xl font-bold">✕</button><h2 className="text-2xl font-black text-gray-800 mb-6 font-jaa italic flex items-center gap-3">{Icons.store} Dados da Loja</h2><div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><InfoCard label="Nome Fantasia" value={selectedStore.name} icon="🏪" /><InfoCard label="CNPJ" value={selectedStore.taxId} icon="🆔" /><InfoCard label="Email" value={selectedStore.email} icon={Icons.email} /><InfoCard label="WhatsApp" value={selectedStore.whatsapp} icon={Icons.whatsapp} /><InfoCard label="Endereço" value={selectedStore.address} icon="📍" /><InfoCard label="Status" value={selectedStore.status} icon="🚦" /><InfoCard label="Saldo Carteira" value={`R$ ${(selectedStore.balance || 0).toFixed(2)}`} icon={Icons.wallet} /></div><div className="bg-orange-50 p-6 rounded-[2rem] border border-orange-100 space-y-4">
    <h3 className="text-xs font-black uppercase text-orange-600 tracking-widest mb-2">Configuração de Preços Individual</h3>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço Mínimo (R$)</label>
            <input type="number" step="0.01" value={safeNum(selectedStore.minPrice, safeNum(settings.minPrice))} onChange={e => onUpdateStore(selectedStore.id, { minPrice: safeNum(e.target.value, safeNum(settings.minPrice)) })} className="w-full p-4 bg-white border border-orange-200 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
        </div>
        <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço por KM (R$)</label>
            <input type="number" step="0.01" value={safeNum(selectedStore.pricePerKm, safeNum(settings.pricePerKm))} onChange={e => onUpdateStore(selectedStore.id, { pricePerKm: safeNum(e.target.value, safeNum(settings.pricePerKm)) })} className="w-full p-4 bg-white border border-orange-200 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
        </div>
        <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cobrar por KM após (KM)</label>
            <input type="number" step="0.1" value={safeNum(selectedStore.kmFranchise, safeNum(settings.kmFranchise))} onChange={e => onUpdateStore(selectedStore.id, { kmFranchise: safeNum(e.target.value, safeNum(settings.kmFranchise)) })} className="w-full p-4 bg-white border border-orange-200 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
        </div>
        <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Taxa de Retorno (R$)</label>
            <input type="number" step="0.01" value={safeNum(selectedStore.returnFeeAmount, safeNum(settings.returnFeeAmount))} onChange={e => onUpdateStore(selectedStore.id, { returnFeeAmount: safeNum(e.target.value, safeNum(settings.returnFeeAmount)) })} className="w-full p-4 bg-white border border-orange-200 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
        </div>
    </div>

    {/* Novos campos migrados do Sistema para a Loja */}
    <div className="pt-4 border-t border-orange-100 space-y-4">
        <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Modelo de Repasse</label>
            <div className="flex bg-white p-1 rounded-2xl border border-orange-200">
                <button type="button" onClick={() => onUpdateStore(selectedStore.id, { driverEarningModel: 'PERCENTAGE' })} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${(selectedStore.driverEarningModel ?? settings.driverEarningModel) === 'PERCENTAGE' ? 'bg-orange-500 text-white shadow' : 'text-gray-500'}`}>Porcentagem</button>
                <button type="button" onClick={() => onUpdateStore(selectedStore.id, { driverEarningModel: 'FIXED' })} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${(selectedStore.driverEarningModel ?? settings.driverEarningModel) === 'FIXED' ? 'bg-orange-500 text-white shadow' : 'text-gray-500'}`}>Taxa Fixa App</button>
            </div>
        </div>
        
        {(selectedStore.driverEarningModel ?? settings.driverEarningModel) === 'PERCENTAGE' ? (
            <div className="space-y-1 animate-in fade-in">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Porcentagem para Motoboy (%)</label>
                <input type="number" value={safeNum(selectedStore.driverEarningPercentage, safeNum(settings.driverEarningPercentage))} onChange={e => onUpdateStore(selectedStore.id, { driverEarningPercentage: safeNum(e.target.value, safeNum(settings.driverEarningPercentage)) })} className="w-full p-4 bg-white border border-orange-200 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
            </div>
        ) : (
            <div className="space-y-1 animate-in fade-in">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Taxa Fixa do App por Corrida (R$)</label>
                <input type="number" step="0.01" value={safeNum(selectedStore.driverEarningFixed, safeNum(settings.driverEarningFixed))} onChange={e => onUpdateStore(selectedStore.id, { driverEarningFixed: safeNum(e.target.value, safeNum(settings.driverEarningFixed)) })} className="w-full p-4 bg-white border border-orange-200 rounded-2xl outline-none font-bold focus:border-[#F84F39]" />
            </div>
        )}
    </div>

    <p className="text-[8px] text-orange-400 font-bold uppercase text-center mt-2 italic">As alterações são salvas automaticamente após editar os valores.</p>
</div>

{/* Gerenciamento de Saldo */}
<div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 space-y-4">
    <h3 className="text-xs font-black uppercase text-blue-600 tracking-widest mb-2 flex items-center gap-2">{Icons.wallet} Gerenciar Saldo</h3>
    <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-blue-100">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Atual</span>
        <span className="text-xl font-black text-gray-800">R$ {(selectedStore.balance || 0).toFixed(2)}</span>
    </div>
    <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Valor da Operação (R$)</label>
        <input type="number" step="0.01" value={storeCreditAmount} onChange={e => setStoreCreditAmount(e.target.value)} placeholder="Ex: 50.00" className="w-full p-4 bg-white border border-blue-200 rounded-2xl outline-none font-bold focus:border-blue-500" />
    </div>
    <div className="flex gap-2 pt-2">
        <button onClick={() => handleAddStoreCredit(selectedStore)} className="flex-1 bg-emerald-500 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2">
            Adicionar
        </button>
        <button onClick={() => handleRemoveStoreCredit(selectedStore)} className="flex-1 bg-red-500 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-red-100 active:scale-95 transition-all flex items-center justify-center gap-2">
            Remover
        </button>
    </div>
</div>

{selectedStore.isBlocked && (<div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-bold"><strong>Usuário Bloqueado.</strong> Motivo: {selectedStore.blockReason}</div>)}<div className="bg-gray-50 p-4 rounded-2xl"><p className="text-[8px] font-black text-gray-400 uppercase mb-2">Segurança: Senha</p><div className="flex gap-2"><input type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} className="flex-1 bg-white border border-gray-200 px-4 py-2 rounded-lg font-bold text-sm" /><button onClick={() => { onUpdateStore(selectedStore.id, { password: editPassword }); alert('Senha atualizada!'); }} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase">{Icons.password} Alterar</button></div></div>{selectedStore.paymentProofUrl && <div><h3 className="text-sm font-bold my-4">Comprovante de Acesso</h3><a href={selectedStore.paymentProofUrl} target="_blank" rel="noopener noreferrer"><img src={selectedStore.paymentProofUrl} className="w-full max-w-sm mx-auto rounded-xl border-2 border-white shadow-lg" alt="comprovante"/></a><button onClick={() => { onApproveAccess(selectedStore.id, selectedStore.accessRequestType || 'DAILY'); setSelectedStoreId(null); }} className="w-full mt-4 jaa-gradient text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg">{Icons.approve} Aprovar Acesso</button></div>}</div>
        {selectedStore.status === StoreRegistrationStatus.PENDING ? (
          <div className="flex gap-4 mt-8">
            <button onClick={() => { onApproveStore(selectedStore.id); setSelectedStoreId(null); }} className="flex-1 jaa-gradient text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg">{Icons.approve} Aprovar Cadastro</button>
            <button onClick={() => { onRejectStore(selectedStore.id); setSelectedStoreId(null); }} className="flex-1 bg-red-100 text-red-500 font-black py-4 rounded-xl text-xs uppercase tracking-widest">{Icons.reject} Recusar</button>
          </div>
        ) : (
          <div className="flex gap-4 mt-8">
            <button onClick={handleToggleBlockStore} className={`flex-1 font-black py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 ${selectedStore.isBlocked ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>{selectedStore.isBlocked ? Icons.unblock : Icons.block} {selectedStore.isBlocked ? 'Desbloquear' : 'Bloquear'}</button>
            <button onClick={() => { if (window.confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE a loja ${selectedStore.name}? Esta ação não pode ser desfeita.`)) { onDeleteStore(selectedStore.id); setSelectedStoreId(null); } }} className="bg-red-500 text-white font-black px-6 py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
              {Icons.reset} Excluir
            </button>
          </div>
        )}
      </div></div>)}
      {selectedOrder && (<div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4"><div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl relative border-4 border-white animate-in zoom-in-95"><button onClick={() => setSelectedOrderId(null)} className="absolute top-6 right-6 text-gray-300 text-xl font-bold">✕</button><h2 className="text-xl font-black text-gray-800 mb-6 font-jaa italic">Validar Pagamento #{selectedOrder.id}</h2><div className="space-y-4"><img src={selectedOrder.paymentReceiptUrl} className="w-full rounded-xl border-4 border-white shadow-2xl" alt="Comprovante" /><div className="flex gap-4 pt-4"><button onClick={() => { onApprovePayment(selectedOrder.id); setSelectedOrderId(null); }} className="flex-1 jaa-gradient text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest">{Icons.approve} Aprovar</button><button onClick={() => { onRejectPayment(selectedOrder.id); setSelectedOrderId(null); }} className="flex-1 bg-red-100 text-red-500 font-black py-4 rounded-xl text-xs uppercase tracking-widest">{Icons.reject} Recusar</button></div></div></div></div>)}
      {selectedRecharge && (<div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4"><div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl relative border-4 border-white animate-in zoom-in-95"><button onClick={() => setSelectedRechargeId(null)} className="absolute top-6 right-6 text-gray-300 text-xl font-bold">✕</button><h2 className="text-xl font-black text-gray-800 mb-6 font-jaa italic">Validar Recarga R$ {(selectedRecharge.amount || 0).toFixed(2)}</h2><div className="space-y-4"><p className="text-sm font-bold text-center text-gray-600">Lojista: {selectedRecharge.storeName}</p><img src={selectedRecharge.paymentReceiptUrl} className="w-full rounded-xl border-4 border-white shadow-2xl cursor-zoom-in hover:scale-[1.02] transition-transform" alt="Comprovante" onClick={() => setEnlargedImageUrl(selectedRecharge.paymentReceiptUrl)} title="Clique para ampliar e conferir os dados" /><div className="flex gap-4 pt-4"><button onClick={() => { onApproveRecharge(selectedRecharge.id); setSelectedRechargeId(null); }} className="flex-1 bg-emerald-500 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest">{Icons.approve} Aprovar Crédito</button><button onClick={() => { onRejectRecharge(selectedRecharge.id); setSelectedRechargeId(null); }} className="flex-1 bg-red-100 text-red-500 font-black py-4 rounded-xl text-xs uppercase tracking-widest">{Icons.reject} Recusar</button></div></div></div></div>)}
    
      {enlargedImageUrl && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in cursor-pointer" onClick={() => setEnlargedImageUrl(null)}>
          <div className="absolute top-6 left-6 z-20 bg-black/50 px-4 py-2 rounded-full border border-white/20">
            <p className="text-white text-[10px] font-black uppercase tracking-widest">
              {zoomScale > 1 ? 'Clique para diminuir' : 'Clique na imagem para ampliar'}
            </p>
          </div>
          <button onClick={() => setEnlargedImageUrl(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-5xl font-light z-20">&times;</button>
          <div className="overflow-hidden rounded-lg shadow-2xl max-w-[95vw] max-h-[95vh]">
            <img 
              src={enlargedImageUrl} 
              style={{ 
                transform: `scale(${zoomScale})`, 
                cursor: zoomScale > 1 ? 'zoom-out' : 'zoom-in',
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              className="object-contain" 
              alt="Documento Ampliado"
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale(prev => prev === 1 ? 2.5 : 1);
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;