import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Order, DriverProfile, StoreProfile, DriverRegistrationStatus, StoreRegistrationStatus, RechargeRequest, PlatformSettings, WithdrawalRequest, WithdrawalRequestStatus, OrderStatus, RechargeRequestStatus } from '../types';

// Helper to format date
const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Icons
const Icons = {
  dashboard: '📊', store: '🏪', driver: '🏍️', order: '📦', finance: '💰', settings: '⚙️',
  approve: '✅', reject: '❌', view: '👁️', close: '✕', menu: '☰'
};

interface AdminDashboardProps {
  onLogout: () => void;
  orders: Order[];
  settings: PlatformSettings;
  onUpdateSettings: (settings: PlatformSettings) => void;
  allDrivers: DriverProfile[];
  onApproveDriver: (id: string) => void;
  onRejectDriver: (id: string) => void;
  allStores: StoreProfile[];
  onApproveStore: (id: string) => void;
  onRejectStore: (id: string) => void;
  onApproveAccess: (id: string, type: 'DAILY' | 'MONTHLY') => void;
  rechargeRequests: RechargeRequest[];
  onApproveRecharge: (id: string) => void;
  onRejectRecharge: (id: string) => void;
  withdrawalRequests: WithdrawalRequest[];
  onApproveWithdrawal: (id: string) => void;
  onRejectWithdrawal: (id: string) => void;
  onApprovePayment: (id: string) => void;
  onRejectPayment: (id: string) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  onLogout, orders, settings, onUpdateSettings, allDrivers, onApproveDriver, onRejectDriver, allStores, onApproveStore, onRejectStore, onApproveAccess, rechargeRequests, onApproveRecharge, onRejectRecharge, withdrawalRequests, onApproveWithdrawal, onRejectWithdrawal, onApprovePayment, onRejectPayment
}) => {
  const [view, setView] = useState('dashboard');
  const [tempSettings, setTempSettings] = useState<PlatformSettings>(settings);
  const [selectedDriver, setSelectedDriver] = useState<DriverProfile | null>(null);
  const [selectedStore, setSelectedStore] = useState<StoreProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  const handleSaveSettings = () => {
    onUpdateSettings(tempSettings);
    alert('Configurações salvas!');
  };

  const handleSettingsChange = (field: keyof PlatformSettings, value: string | number) => {
    const numericFields: (keyof PlatformSettings)[] = [
      'dailyPrice', 'monthlyPrice', 'minPrice', 'pricePerKm', 
      'minimumWithdrawalAmount', 'driverEarningPercentage', 'driverEarningFixed'
    ];
    if (numericFields.includes(field)) {
      const numValue = parseFloat(String(value));
      setTempSettings(prev => ({...prev, [field]: isNaN(numValue) ? 0 : numValue }));
    } else {
      setTempSettings(prev => ({...prev, [field]: value}));
    }
  };

  const pendingDrivers = allDrivers.filter(d => d.status === DriverRegistrationStatus.PENDING);
  const approvedDrivers = allDrivers.filter(d => d.status === DriverRegistrationStatus.APPROVED);
  const pendingStores = allStores.filter(s => s.status === StoreRegistrationStatus.PENDING);
  const approvedStores = allStores.filter(s => s.status === StoreRegistrationStatus.APPROVED);
  const pendingRecharges = rechargeRequests.filter(r => r.status === RechargeRequestStatus.PENDING);
  const pendingWithdrawals = withdrawalRequests.filter(w => w.status === WithdrawalRequestStatus.PENDING);
  const pendingPayments = orders.filter(o => o.status === OrderStatus.PENDING_PAYMENT_CONFIRMATION);

  const stats = {
    totalOrders: orders.length,
    onlineDrivers: allDrivers.filter(d => d.isOnline).length,
    activeStores: approvedStores.length,
    pendingActions: pendingDrivers.length + pendingStores.length + pendingRecharges.length + pendingWithdrawals.length + pendingPayments.length,
    totalRevenue: orders.filter(o => o.status === OrderStatus.DELIVERED).reduce((acc, o) => acc + (o.price - o.driverEarning), 0)
  };
  
  const ordersByDay = orders.reduce((acc, order) => {
      const date = new Date(order.timestamp).toLocaleDateString('pt-BR');
      acc[date] = (acc[date] || 0) + 1;
      return acc;
  }, {} as Record<string, number>);

  const chartData = Object.keys(ordersByDay)
    .map(date => ({ date, Pedidos: ordersByDay[date] }))
    .sort((a, b) => new Date(a.date.split('/').reverse().join('-')).getTime() - new Date(b.date.split('/').reverse().join('-')).getTime())
    .slice(-30);

  const NavButton = ({ currentView, targetView, icon, label, notificationCount }: { currentView: string, targetView: string, icon: string, label:string, notificationCount?: number }) => (
    <button onClick={() => { setView(targetView); setIsSidebarOpen(false); }} className={`flex items-center gap-4 w-full text-left px-6 py-4 rounded-2xl transition-all ${currentView === targetView ? 'bg-[#F84F39] text-white shadow-lg' : 'hover:bg-gray-100 text-gray-700'}`}>
      <span className="text-2xl">{icon}</span>
      <span className="font-bold text-sm flex-1">{label}</span>
      {notificationCount > 0 && <span className="bg-white text-[#F84F39] w-6 h-6 flex items-center justify-center text-xs font-black rounded-full">{notificationCount}</span>}
    </button>
  );

  const renderContent = () => {
    switch(view) {
      case 'dashboard':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border"><p className="text-sm text-gray-400 font-bold">Pedidos Totais</p><p className="text-4xl font-black text-gray-800">{stats.totalOrders}</p></div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border"><p className="text-sm text-gray-400 font-bold">Receita Plataforma</p><p className="text-4xl font-black text-gray-800">R${stats.totalRevenue.toFixed(2)}</p></div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border"><p className="text-sm text-gray-400 font-bold">Motoboys Online</p><p className="text-4xl font-black text-gray-800">{stats.onlineDrivers}</p></div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border"><p className="text-sm text-gray-400 font-bold">Ações Pendentes</p><p className="text-4xl font-black text-[#F84F39]">{stats.pendingActions}</p></div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border h-[400px]">
              <h3 className="font-bold text-gray-800 mb-4">Pedidos nos Últimos 30 Dias</h3>
              <ResponsiveContainer width="100%" height="90%">
                 <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" interval={Math.floor(chartData.length / 10)} tick={{fontSize: 12}} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Pedidos" fill="#F84F39" radius={[10, 10, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      case 'lojas':
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h3 className="font-bold text-lg mb-4">Lojas Pendentes ({pendingStores.length})</h3>
                    <div className="space-y-4">
                        {pendingStores.map(s => (
                            <div key={s.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                                <div><p className="font-bold">{s.name}</p><p className="text-xs text-gray-500">{s.city}</p></div>
                                <div className="flex gap-2">
                                    <button onClick={() => onApproveStore(s.id)} className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">{Icons.approve}</button>
                                    <button onClick={() => onRejectStore(s.id)} className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center">{Icons.reject}</button>
                                </div>
                            </div>
                        ))}
                        {pendingStores.length === 0 && <p className="text-gray-400 text-sm">Nenhuma loja pendente.</p>}
                    </div>
                </div>
                <div>
                    <h3 className="font-bold text-lg mb-4">Lojas Aprovadas ({approvedStores.length})</h3>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                        {approvedStores.map(s => (
                            <div key={s.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                                <div><p className="font-bold">{s.name}</p><p className="text-xs text-gray-500">{s.city}</p></div>
                                <button onClick={() => setSelectedStore(s)} className="w-10 h-10 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center">{Icons.view}</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
      case 'motoboys':
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h3 className="font-bold text-lg mb-4">Motoboys Pendentes ({pendingDrivers.length})</h3>
                    <div className="space-y-4">
                        {pendingDrivers.map(d => (
                            <div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                                <div><p className="font-bold">{d.name}</p><p className="text-xs text-gray-500">{d.city}</p></div>
                                <div className="flex gap-2">
                                    <button onClick={() => setSelectedDriver(d)} className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">{Icons.view}</button>
                                    <button onClick={() => onApproveDriver(d.id)} className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">{Icons.approve}</button>
                                    <button onClick={() => onRejectDriver(d.id)} className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center">{Icons.reject}</button>
                                </div>
                            </div>
                        ))}
                        {pendingDrivers.length === 0 && <p className="text-gray-400 text-sm">Nenhum motoboy pendente.</p>}
                    </div>
                </div>
                <div>
                    <h3 className="font-bold text-lg mb-4">Motoboys Aprovados ({approvedDrivers.length})</h3>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                        {approvedDrivers.map(d => (
                            <div key={d.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                                <div><p className="font-bold">{d.name}</p><p className="text-xs text-gray-500">{d.isOnline ? <span className="text-green-500">Online</span> : <span className="text-gray-400">Offline</span>} - {d.city}</p></div>
                                <button onClick={() => setSelectedDriver(d)} className="w-10 h-10 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center">{Icons.view}</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
      case 'pedidos':
        return (
          <div>
            <h3 className="font-bold text-lg mb-4">Pagamentos Pendentes ({pendingPayments.length})</h3>
            <div className="space-y-4 mb-8">
                {pendingPayments.map(order => (
                    <div key={order.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                        <div>
                            <p className="font-bold">Pedido #{order.id} - R$ {order.price.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">{approvedStores.find(s => s.id === order.storeId)?.name || 'Loja desconhecida'}</p>
                            {order.paymentReceiptUrl && <a href={order.paymentReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 underline">Ver Comprovante</a>}
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => onApprovePayment(order.id)} className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">{Icons.approve}</button>
                           <button onClick={() => onRejectPayment(order.id)} className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center">{Icons.reject}</button>
                        </div>
                    </div>
                ))}
                {pendingPayments.length === 0 && <p className="text-gray-400 text-sm">Nenhum pagamento pendente.</p>}
            </div>

            <h3 className="font-bold text-lg mb-4">Últimos Pedidos</h3>
             <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[600px]">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="p-4">ID</th>
                            <th className="p-4">Loja</th>
                            <th className="p-4">Valor</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.slice(0, 20).map(o => (
                            <tr key={o.id} className="border-b last:border-0">
                                <td className="p-4 font-mono text-xs">#{o.id}</td>
                                <td className="p-4 font-bold">{approvedStores.find(s => s.id === o.storeId)?.name}</td>
                                <td className="p-4">R$ {o.price.toFixed(2)}</td>
                                <td className="p-4"><span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">{o.status}</span></td>
                                <td className="p-4 whitespace-nowrap">{formatDateTime(o.timestamp)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          </div>
        );
      case 'financeiro':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="font-bold text-lg mb-4">Recargas Pendentes ({pendingRecharges.length})</h3>
              <div className="space-y-4">
                  {pendingRecharges.map(r => (
                      <div key={r.id} className="bg-white p-4 rounded-2xl shadow-sm border flex justify-between items-center">
                          <div><p className="font-bold">{r.storeName}</p><p className="text-xl font-black text-green-500">R$ {r.amount.toFixed(2)}</p></div>
                          <div className="flex gap-2">
                              <button onClick={() => onApproveRecharge(r.id)} className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">{Icons.approve}</button>
                              <button onClick={() => onRejectRecharge(r.id)} className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center">{Icons.reject}</button>
                          </div>
                      </div>
                  ))}
                  {pendingRecharges.length === 0 && <p className="text-gray-400 text-sm">Nenhuma recarga pendente.</p>}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Saques Pendentes ({pendingWithdrawals.length})</h3>
                <div className="space-y-4">
                    {pendingWithdrawals.map(w => (
                        <div key={w.id} className="bg-white p-4 rounded-2xl shadow-sm border">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{w.driverName}</p>
                                    <p className="text-xl font-black text-red-500">R$ {w.amount.toFixed(2)}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => onApproveWithdrawal(w.id)} className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">{Icons.approve}</button>
                                    <button onClick={() => onRejectWithdrawal(w.id)} className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center">{Icons.reject}</button>
                                </div>
                            </div>
                            {w.driverPixKey && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <label className="text-[9px] font-bold text-gray-400 uppercase">Chave PIX</label>
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                                    <p className="text-xs font-mono text-gray-700 break-all">{w.driverPixKey}</p>
                                    <button 
                                      onClick={() => navigator.clipboard.writeText(w.driverPixKey || '')} 
                                      className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300 transition-colors ml-2"
                                    >
                                      Copiar
                                    </button>
                                </div>
                              </div>
                            )}
                        </div>
                    ))}
                    {pendingWithdrawals.length === 0 && <p className="text-gray-400 text-sm">Nenhum saque pendente.</p>}
                </div>
            </div>
          </div>
        );
      case 'settings':
        return (
            <div className="bg-white p-8 rounded-3xl shadow-sm border max-w-4xl mx-auto space-y-12">
              <div>
                <h3 className="text-xl font-black text-gray-800 mb-1">Configurações da Plataforma</h3>
                <p className="text-sm text-gray-400">Ajuste os parâmetros de funcionamento do Jaa Delivery.</p>
              </div>

              {/* Seção de Preços */}
              <div className="space-y-6">
                <div className="border-b border-gray-100 pb-4">
                  <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">PREÇOS</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {/* Preços Lojas */}
                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="text-xs font-bold text-gray-500">Acesso da Loja</label>
                    <div className="flex gap-4 p-2 bg-gray-50 rounded-xl">
                      <div className="flex-1">
                        <span className="text-[10px] font-bold text-gray-400 ml-2">Diário</span>
                        <div className="relative mt-1">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                          <input type="number" step="0.50" value={tempSettings.dailyPrice} onChange={e => handleSettingsChange('dailyPrice', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                        </div>
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold text-gray-400 ml-2">Mensal</span>
                        <div className="relative mt-1">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                           <input type="number" step="1.00" value={tempSettings.monthlyPrice} onChange={e => handleSettingsChange('monthlyPrice', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                        </div>
                      </div>
                    </div>
                  </div>
                   {/* Preços Entregas */}
                   <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">Preço Mínimo (Corrida)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                      <input type="number" step="0.50" value={tempSettings.minPrice} onChange={e => handleSettingsChange('minPrice', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent border-2 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">Preço por KM</label>
                     <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                      <input type="number" step="0.10" value={tempSettings.pricePerKm} onChange={e => handleSettingsChange('pricePerKm', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent border-2 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção de Remuneração */}
              <div className="space-y-6">
                 <div className="border-b border-gray-100 pb-4">
                  <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">REMUNERAÇÃO DO MOTOBOY</h4>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500">Modelo de Remuneração</label>
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                    <button onClick={() => handleSettingsChange('driverEarningModel', 'PERCENTAGE')} className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${tempSettings.driverEarningModel === 'PERCENTAGE' ? 'bg-white text-[#F84F39] shadow-sm' : 'text-gray-500'}`}>PORCENTAGEM</button>
                    <button onClick={() => handleSettingsChange('driverEarningModel', 'FIXED')} className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${tempSettings.driverEarningModel === 'FIXED' ? 'bg-white text-[#F84F39] shadow-sm' : 'text-gray-500'}`}>VALOR FIXO</button>
                  </div>
                </div>

                {tempSettings.driverEarningModel === 'PERCENTAGE' ? (
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <label className="text-xs font-bold text-gray-500">Porcentagem do Motoboy</label>
                    <div className="relative">
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">%</span>
                      <input type="number" step="1" value={tempSettings.driverEarningPercentage} onChange={e => handleSettingsChange('driverEarningPercentage', e.target.value)} className="w-full pl-4 pr-10 py-3 bg-gray-50 border-transparent border-2 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <label className="text-xs font-bold text-gray-500">Valor Fixo por Entrega</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                      <input type="number" step="0.50" value={tempSettings.driverEarningFixed} onChange={e => handleSettingsChange('driverEarningFixed', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent border-2 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                    </div>
                  </div>
                )}
              </div>

              {/* Seção Financeiro */}
              <div className="space-y-6">
                 <div className="border-b border-gray-100 pb-4">
                  <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">FINANCEIRO</h4>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500">Saque Mínimo (Motoboy)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                        <input type="number" step="5.00" value={tempSettings.minimumWithdrawalAmount} onChange={e => handleSettingsChange('minimumWithdrawalAmount', e.target.value)} className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent border-2 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500">Chave PIX da Plataforma</label>
                      <input type="text" value={tempSettings.pixKey} onChange={e => handleSettingsChange('pixKey', e.target.value)} className="w-full px-4 py-3 bg-gray-50 border-transparent border-2 rounded-lg font-bold text-gray-800 outline-none focus:border-[#F84F39]"/>
                    </div>
                 </div>
              </div>

              <button onClick={handleSaveSettings} className="w-full jaa-gradient text-white font-bold py-5 rounded-2xl mt-12 shadow-xl shadow-red-100 text-sm uppercase tracking-widest active:scale-95 transition-transform">
                SALVAR CONFIGURAÇÕES
              </button>
            </div>
          );
      default: return <div>Selecione uma opção</div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-10 md:hidden"></div>}

      <aside className={`fixed md:relative z-20 w-72 bg-white p-6 border-r border-gray-200 flex flex-col h-full transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex items-center justify-between mb-12">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 jaa-gradient rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg font-jaa italic">J</div>
             <div><h1 className="text-lg font-black text-gray-800">Admin</h1><p className="text-xs text-gray-400">Jaa Delivery</p></div>
           </div>
           <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-2xl text-gray-400">{Icons.close}</button>
        </div>
        <nav className="flex-1 space-y-2">
           <NavButton currentView={view} targetView="dashboard" icon={Icons.dashboard} label="Dashboard" notificationCount={stats.pendingActions} />
           <NavButton currentView={view} targetView="lojas" icon={Icons.store} label="Lojas" notificationCount={pendingStores.length} />
           <NavButton currentView={view} targetView="motoboys" icon={Icons.driver} label="Motoboys" notificationCount={pendingDrivers.length} />
           <NavButton currentView={view} targetView="pedidos" icon={Icons.order} label="Pedidos" notificationCount={pendingPayments.length} />
           <NavButton currentView={view} targetView="financeiro" icon={Icons.finance} label="Financeiro" notificationCount={pendingRecharges.length + pendingWithdrawals.length}/>
           <NavButton currentView={view} targetView="settings" icon={Icons.settings} label="Configurações" />
        </nav>
        <button onClick={onLogout} className="mt-8 w-full text-left px-6 py-3 text-gray-500 font-bold text-sm hover:bg-gray-100 rounded-2xl">Sair</button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 bg-white shadow-sm p-4 z-10 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 jaa-gradient rounded-xl flex items-center justify-center text-white font-black text-lg font-jaa italic">J</div>
                <h1 className="text-lg font-black text-gray-800">Admin</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(true)} className="text-2xl p-2">{Icons.menu}</button>
        </header>
        <main className="flex-1 p-4 md:p-10 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {selectedDriver && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300" onClick={() => setSelectedDriver(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div><h3 className="text-xl font-bold">{selectedDriver.name}</h3><p className="text-sm text-gray-500">{selectedDriver.city} - {selectedDriver.plate}</p></div>
              <button onClick={() => setSelectedDriver(null)} className="text-2xl text-gray-400">{Icons.close}</button>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto"><a href={selectedDriver.licenseImageUrl} target="_blank" rel="noreferrer"><img src={selectedDriver.licenseImageUrl} className="rounded-lg w-full h-auto" alt="CNH"/></a><a href={selectedDriver.selfieWithLicenseUrl} target="_blank" rel="noreferrer"><img src={selectedDriver.selfieWithLicenseUrl} className="rounded-lg w-full h-auto" alt="Selfie com CNH"/></a><a href={selectedDriver.vehiclePhotoUrl1} target="_blank" rel="noreferrer"><img src={selectedDriver.vehiclePhotoUrl1} className="rounded-lg w-full h-auto" alt="Moto 1"/></a><a href={selectedDriver.vehiclePhotoUrl2} target="_blank" rel="noreferrer"><img src={selectedDriver.vehiclePhotoUrl2} className="rounded-lg w-full h-auto" alt="Moto 2"/></a></div>
          </div>
        </div>
      )}
      {selectedStore && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300" onClick={() => setSelectedStore(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div><h3 className="text-xl font-bold">{selectedStore.name}</h3><p className="text-sm text-gray-500">{selectedStore.city} - {selectedStore.taxId}</p></div>
              <button onClick={() => setSelectedStore(null)} className="text-2xl text-gray-400">{Icons.close}</button>
            </div>
             <div className="mt-6 space-y-2 text-sm"><p><strong>Endereço:</strong> {selectedStore.address}</p><p><strong>Email:</strong> {selectedStore.email}</p><p><strong>Saldo:</strong> R$ {selectedStore.balance.toFixed(2)}</p><p><strong>Raio:</strong> {selectedStore.deliveryRadius} km</p></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;