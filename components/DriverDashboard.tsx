import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Order, OrderStatus, DriverProfile, Location, DriverRegistrationStatus, PlatformSettings, WithdrawalRequest, WithdrawalRequestStatus } from '../types';
import MapView from './MapView';
import { APP_LOGO } from '../constants';
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyC0jC_pMntiAj_XepIXauLsYh8vojOX-Mo",
  authDomain: "pedeja-b9080.firebaseapp.com",
  projectId: "pedeja-b9080",
  storageBucket: "pedeja-b9080.firebasestorage.app",
  messagingSenderId: "479512861371",
  appId: "1:479512861371:web:0d3ae540e90882ee02a79e",
  measurementId: "G-JZKXH4EBQX"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

interface DriverDashboardProps {
  onLogout: () => void;
  availableOrders: Order[];
  scheduledOrders: Order[];
  activeOrders: Order[];
  allOrders: Order[]; 
  onUpdateStatus: (id: string, status: OrderStatus, driverId?: string) => Promise<void> | void;
  onReportReturn: (orderId: string) => void;
  balance: number;
  profile: DriverProfile;
  settings: PlatformSettings;
  withdrawalRequests: WithdrawalRequest[];
  onNewWithdrawalRequest: (driverId: string, driverName: string, amount: number) => void;
  onToggleOnline: (driverId: string, isOnline: boolean) => void;
  onUpdateLocation: (driverId: string, location: Location) => void;
  onUpdateProfile: (driverId: string, data: Partial<DriverProfile>) => void;
  onRefresh: () => void;
  isSyncing: boolean;
}

const formatDateTime = (timestamp: number) => {
  try {
    return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return 'N/A';
  }
};

// 1. Pré-carregar o Áudio Globalmente (Garante que esteja baixado antes da corrida)
const alertSound = new Audio('https://actions.google.com/sounds/v1/alarms/notification_high_pitch.ogg');
alertSound.load(); // Força o carregamento antecipado

const DriverDashboard: React.FC<DriverDashboardProps> = ({ 
  onLogout, availableOrders = [], scheduledOrders = [], activeOrders = [], allOrders = [], onUpdateStatus, onReportReturn, balance = 0, profile, settings, withdrawalRequests = [], onNewWithdrawalRequest, onToggleOnline, onUpdateLocation, onUpdateProfile, onRefresh, isSyncing
}) => {
  const isOnline = profile?.isOnline || false;
  const isRouteActive = activeOrders.length > 0;
  const isMultiRoute = activeOrders.length > 1;
  const commonStatus = activeOrders[0]?.status || OrderStatus.SEARCHING;

  // Lógica de Retorno: Pedidos entregues mas com taxa de retorno pendente de liberação pela loja
  const returningOrders = useMemo(() => {
    if (!profile?.id) return [];
    return allOrders.filter(o => 
      o.driverId === profile.id && 
      o.status === OrderStatus.DELIVERED && 
      o.hasReturnFee === true && 
      o.returnFeePaid !== true
    );
  }, [allOrders, profile?.id]);

  const isReturning = returningOrders.length > 0;

  const [isUpdating, setIsUpdating] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'orders' | 'scheduled' | 'history'>('orders');
  const [deliveryCodes, setDeliveryCodes] = useState<Record<string, string>>({});
  
  // Estados do Modal do Firebase FCM
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dadosNovaCorrida, setDadosNovaCorrida] = useState<{
    id: string;
    endereco: string;
    valor: string;
    distancia?: string;
    valorPorKm?: string;
    paradas?: string;
    nomeLoja?: string;
    enderecoColeta?: string;
    tipoEntrega?: string;
    metodoPagamento?: string;
  } | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);

  // Cronômetro do Modal
  useEffect(() => {
    let timer: any;
    if (isModalOpen && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isModalOpen && timeLeft === 0) {
      fecharModal();
    }
    return () => clearInterval(timer);
  }, [isModalOpen, timeLeft]);

  // Resetar cronômetro ao abrir modal
  useEffect(() => {
    if (isModalOpen) {
      setTimeLeft(20);
    }
  }, [isModalOpen]);

  // ============================================================================
  // FUNÇÃO DE ACEITE INDEPENDENTE (DIRETO DO MODAL)
  // ============================================================================
  const aceitarCorridaDiretoDoModal = async (corridaId: string) => {
    if (!corridaId) {
      alert("ERRO: ID da corrida não encontrado no payload do Firebase (undefined).");
      return;
    }

    setIsAccepting(true);
    try {
      // Faz a requisição direta para a API/Banco de dados para atribuir a corrida ao motoboy,
      // ignorando se a corrida já renderizou na lista da tela ou não.
      await onUpdateStatus(corridaId, OrderStatus.ACCEPTED, profile.id);
      
      // Apenas quando a requisição retornar SUCESSO, feche o Modal
      setIsModalOpen(false);
      setDadosNovaCorrida(null);
      
      alertSound.pause();
      alertSound.currentTime = 0;
    } catch (error) {
      console.error("Erro ao aceitar corrida direto do modal:", error);
      alert(`Erro ao aceitar a corrida: ${error}`);
    } finally {
      setIsAccepting(false);
    }
  };

  const fecharModal = () => {
    setIsModalOpen(false);
    setDadosNovaCorrida(null);
    alertSound.pause();
    alertSound.currentTime = 0;
  };

  const lastAvailableCount = useRef<number>();

  const [tempProfile, setTempProfile] = useState({
    name: profile?.name || '',
    cep: profile?.cep || '',
    city: profile?.city || '',
    pixKey: profile?.pixKey || '',
    currentLocation: profile?.currentLocation || { lat: -23.55, lng: -46.63 }
  });

  const cityOrders = useMemo(() => {
    const driverCity = (profile?.city || "").toLowerCase().trim();
    return availableOrders.filter(o => 
      (o.storeCity || "").toLowerCase().trim() === driverCity
    );
  }, [availableOrders, profile?.city]);

  const driverHistory = useMemo(() => {
    return allOrders
      .filter(o => o.driverId === profile?.id && o.status === OrderStatus.DELIVERED)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [allOrders, profile?.id]);

  const hasPendingWithdrawal = useMemo(() => {
    return withdrawalRequests.some(r => r.driverId === profile?.id && r.status === WithdrawalRequestStatus.PENDING);
  }, [withdrawalRequests, profile?.id]);

  const handleToggleOnlineStatus = async () => {
    const nextStatus = !isOnline;
    if (nextStatus) {
      await requestNotificationPermission();
    }
    onToggleOnline(profile.id, nextStatus);
  };

  const requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, { vapidKey: 'BJmmbTg1SIjJTOBjSh9CkkPIrE8EfiVjK8gmNpIhG9FExgFPeR0z3-mnRHeAuTykEv55UBVdBd-lmOwJjOr5ANc' });
        if (token) {
          console.log("FCM Token:", token);
          onUpdateProfile(profile.id, { fcmToken: token });
        } else {
          console.log("Nenhum token de registro disponível.");
        }
      }
    } catch (error) {
      console.error("Erro ao obter token:", error);
    }
  };

  useEffect(() => {
    requestNotificationPermission();

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Mensagem recebida com o app aberto: ', payload);
      alertSound.play().catch(e => console.log(e));
      if ("vibrate" in navigator) {
        navigator.vibrate([1000, 500, 1000, 500, 2000]);
      }
      
      // Extrair os detalhes da corrida diretamente do payload.data
      const corridaData = payload.data || {};
      const detalhes = corridaData.detalhes || payload.notification?.body || 'Toque aqui para abrir e ver os detalhes da entrega.';
      
      // Forçar a notificação no sistema operacional (Foreground)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(
            payload.notification?.title || payload.data?.titulo || "🛵 Nova Corrida!", 
            {
              body: payload.notification?.body || payload.data?.detalhes || "Deslize para baixo e toque aqui.",
              icon: "/favicon.ico", // Ícone obrigatório para a barra de status
              badge: "/favicon.ico",
              requireInteraction: true,
              vibrate: [1000, 500, 1000]
            } as any
          );
        });
      }
      
      const timeoutId = setTimeout(() => {
        // Captura do ID (Crucial): Garante que o estado receba OBRIGATORIAMENTE a propriedade id
        const idCapturado = corridaData.id || corridaData.orderId || corridaData.corrida_id || corridaData.corridaId;
        
        setDadosNovaCorrida({
          id: idCapturado || '',
          endereco: corridaData.endereco || detalhes,
          valor: corridaData.valor || '---',
          distancia: corridaData.distancia || '',
          valorPorKm: corridaData.valorPorKm || '1,76',
          paradas: corridaData.paradas || '1 parada',
          nomeLoja: corridaData.nomeLoja || 'Estabelecimento',
          enderecoColeta: corridaData.enderecoColeta || 'Endereço de coleta...',
          tipoEntrega: corridaData.tipoEntrega || 'Nuvem',
          metodoPagamento: corridaData.metodoPagamento || 'Carteira de créditos'
        });
        setIsModalOpen(true);
      }, 1500);
    });

    return () => {
      unsubscribe();
    };
  }, []);
  
  // Ouvinte (Listener) para cancelamento de corridas ativas
  useEffect(() => {
    // Se não houver corrida ativa na tela, não faz nada
    if (activeOrders.length === 0) return;

    // Pega os IDs das corridas que estão ativas na tela do motoboy
    const activeOrderIds = activeOrders.map(o => o.id);

    // Procura na lista global de pedidos (allOrders) se alguma dessas corridas ativas mudou para CANCELADA
    const canceledOrder = allOrders.find(
      o => activeOrderIds.includes(o.id) && o.status === OrderStatus.CANCELED
    );

    if (canceledOrder) {
      // Exibe o alerta nativo informando o cancelamento
      alert('Atenção: Esta corrida foi cancelada pelo estabelecimento.');
      
      // O redirecionamento/limpeza da tela acontece automaticamente porque o componente pai (App.tsx)
      // vai re-renderizar o DriverDashboard passando a nova lista de activeOrders (que agora estará vazia
      // para esta corrida, pois o status mudou para CANCELED).
      // Forçamos um refresh apenas para garantir a sincronia imediata.
      onRefresh();
    }
  }, [allOrders, activeOrders, onRefresh]);

  // Sincronização do contador de pedidos disponíveis
  useEffect(() => {
    lastAvailableCount.current = cityOrders.length;
  }, [cityOrders]);

  useEffect(() => {
    let watchId: number;
    if (isOnline && profile?.status === DriverRegistrationStatus.APPROVED) {
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
  }, [isOnline, profile?.id, profile?.status, onUpdateLocation]);

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

  const handleGlobalStatusUpdate = async () => {
    if (activeOrders.length === 0 || isUpdating) return;
    setIsUpdating(true);
    try {
      const currentStatus = activeOrders[0].status;
      let nextStatus: OrderStatus | null = null;
      if (currentStatus === OrderStatus.ACCEPTED) nextStatus = OrderStatus.PICKUP;
      else if (currentStatus === OrderStatus.PICKUP) nextStatus = OrderStatus.IN_TRANSIT;
      if (nextStatus) await onUpdateStatus(activeOrders[0].id, nextStatus, profile.id);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFinishDelivery = async (order: Order) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      if (!order.requiresDeliveryCode) {
          await onUpdateStatus(order.id, OrderStatus.DELIVERED, profile.id);
      } else {
          const code = deliveryCodes[order.id];
          if (code?.trim() === order.deliveryCode) {
              await onUpdateStatus(order.id, OrderStatus.DELIVERED, profile.id);
              setDeliveryCodes(prev => {
                const next = {...prev};
                delete next[order.id];
                return next;
              });
          } else {
              alert("Código de entrega incorreto para este pedido!");
          }
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleWithdraw = () => {
    if (!profile?.pixKey) {
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
    if (amount < (settings?.minimumWithdrawalAmount || 80)) {
      alert(`O valor mínimo para saque é de R$${(settings?.minimumWithdrawalAmount || 80).toFixed(2)}.`);
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
        case OrderStatus.IN_TRANSIT: return "Manifesto de Entregas";
        default: return "Atualizar Status";
    }
  };
  
  const mapMarkers: { id: string; type: 'STORE' | 'DRIVER' | 'DROPOFF' | 'ASSIGNED_DRIVER'; location: Location; name?: string; }[] = [];
  if (profile?.currentLocation) {
    mapMarkers.push({ id: profile.id, type: 'DRIVER', location: profile.currentLocation, name: 'Você' });
  }

  // Lógica de Marcadores no Mapa
  if (isRouteActive) {
    mapMarkers.push({ id: 'pickup', type: 'STORE', location: activeOrders[0].pickup, name: 'Coleta' });
    activeOrders.forEach(o => {
      mapMarkers.push({ id: `drop-${o.id}`, type: 'DROPOFF', location: o.dropoff, name: `Entrega #${o.id}` });
    });
  } else if (isReturning && returningOrders[0]) {
    mapMarkers.push({ id: 'return-store', type: 'STORE', location: returningOrders[0].pickup, name: 'Ponto de Retorno' });
  }

  const totalRouteEarning = activeOrders.reduce((acc, o) => acc + (o.driverEarning || 0) + (o.hasReturnFee ? (o.returnFeePrice || 0) : 0), 0);

  // Verificação de Status de Aprovação
  if (profile?.status === DriverRegistrationStatus.PENDING) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-[#f7f7f7] items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-[3rem] shadow-xl max-w-sm w-full space-y-6 border-4 border-white animate-in zoom-in-95">
          <div className="w-24 h-24 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner">
            ⏳
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-800 mb-2 font-jaa italic">Cadastro em Análise</h2>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">
              Seu cadastro está em análise. Aguarde a aprovação do administrador para começar a receber corridas.
            </p>
          </div>
          <button 
            onClick={onLogout} 
            className="w-full bg-gray-100 text-gray-600 font-black py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#f7f7f7]">
      <header className="sticky top-0 bg-white px-6 py-4 flex justify-between items-center border-b border-gray-100 z-40 shadow-sm">
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-base shadow-md font-jaa italic transition-all duration-500 ${isOnline ? 'jaa-gradient' : 'bg-gray-400'}`}>J</div>
          <div>
            <h2 className="text-sm font-black text-gray-800 uppercase tracking-tighter">{profile?.name || 'Motoboy'}</h2>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></div>
              <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{isOnline ? 'Disponível' : 'Indisponível'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-100 gap-3">
            <span className={`text-[8px] font-black uppercase tracking-widest ${isOnline ? 'text-emerald-500' : 'text-gray-400'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <button 
              onClick={handleToggleOnlineStatus}
              className={`w-10 h-5 rounded-full relative transition-all duration-300 flex items-center px-0.5 ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${isOnline ? 'translate-x-5' : 'translate-x-0'}`}></div>
            </button>
          </div>

          <button 
            onClick={onRefresh}
            disabled={isSyncing}
            className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-base disabled:opacity-50 shadow-sm"
            title="Atualizar corridas"
          >
            <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
          </button>
          <button onClick={() => setIsMenuOpen(true)} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-base shadow-sm">☰</button>
        </div>
      </header>

      {/* Sidebar Menu */}
      {isMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] animate-in fade-in"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-72 bg-white z-[101] shadow-2xl animate-in slide-in-from-right duration-300 p-8 flex flex-col">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="font-jaa font-black italic text-2xl text-gray-800">Menu</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Opções do Entregador</p>
              </div>
              <button onClick={() => setIsMenuOpen(false)} className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-gray-500 text-2xl">✕</button>
            </div>
            
            <div className="flex-1 space-y-3">
              <button 
                onClick={() => { setIsEditingProfile(true); setIsMenuOpen(false); }}
                className="flex items-center gap-4 w-full p-5 rounded-[2rem] hover:bg-gray-50 transition-all text-gray-700 font-black uppercase text-[11px] tracking-widest border border-transparent hover:border-gray-100 group"
              >
                <span className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl group-hover:bg-white group-hover:shadow-sm transition-all">⚙️</span>
                <span>Configurações</span>
              </button>
              
              <button 
                onClick={() => { onLogout(); setIsMenuOpen(false); }}
                className="flex items-center gap-4 w-full p-5 rounded-[2rem] hover:bg-red-50 hover:text-red-500 transition-all text-gray-700 font-black uppercase text-[11px] tracking-widest border border-transparent hover:border-red-100 group"
              >
                <span className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl group-hover:bg-white group-hover:shadow-sm transition-all">🚪</span>
                <span>Sair da Conta</span>
              </button>
            </div>
            
            <div className="pt-8 border-t border-gray-100 mt-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 jaa-gradient rounded-xl flex items-center justify-center text-white font-black text-xs shadow-md">
                   <span className="font-jaa italic">PJ</span>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Pede Já Delivery</p>
                  <p className="text-[9px] text-gray-300 font-bold">Versão 1.0.4</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6">
        {!isOnline && !isRouteActive && !isReturning && (
          <div className="bg-gray-800 p-4 rounded-3xl text-center space-y-2 animate-in slide-in-from-top-4">
            <p className="text-white font-black text-xs uppercase tracking-widest">Você está em modo de descanso</p>
            <p className="text-gray-400 text-[9px] font-bold uppercase tracking-wider">Ligue o interruptor acima para começar a receber corridas</p>
          </div>
        )}

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Atual</p>
            <h3 className="text-3xl font-black text-gray-800">R$ {(balance || 0).toFixed(2)}</h3>
          </div>
          <button onClick={() => setIsEditingProfile(true)} className="w-full bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest py-4 rounded-xl active:scale-95 transition-all">SOLICITAR SAQUE / CONFIGS</button>
        </div>

        {isRouteActive ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl border-4 border-white overflow-hidden animate-in fade-in duration-300">
                <div className="h-64"><MapView markers={mapMarkers} userLocation={profile?.currentLocation} /></div>
                <div className="p-6 space-y-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-black italic font-jaa uppercase tracking-tight">
                          {isMultiRoute ? 'Manifesto de Rota Agrupada' : `Entrega #${activeOrders[0].id}`}
                        </h3>
                        {isMultiRoute && <span className="bg-orange-50 text-[#F84F39] text-[8px] font-black px-2 py-0.5 rounded-full uppercase">{activeOrders.length} Paradas</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-[#F84F39]">R$ {totalRouteEarning.toFixed(2)}</span>
                        <p className="text-[7px] text-gray-400 font-bold uppercase">Ganhos da Rota</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                        <div className="bg-blue-50 p-4 rounded-2xl flex items-center gap-4">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm">🏪</div>
                          <div className="flex-1 min-w-0">
                              <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Local de Coleta</p>
                              <p className="text-xs font-bold text-gray-700 truncate">{activeOrders[0].pickup.address}</p>
                          </div>
                        </div>

                        <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:border-l-2 before:border-dashed before:border-gray-200">
                          {activeOrders.map((order, idx) => (
                            <div key={order.id} className="bg-gray-50 p-4 rounded-2xl relative border border-white shadow-sm">
                                <div className="absolute -left-[1.65rem] top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-[#F84F39] rounded-full flex items-center justify-center text-[10px] font-black text-[#F84F39] z-10 shadow-sm">
                                  {idx + 1}
                                </div>
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="text-[8px] font-black text-gray-400 uppercase">Parada #{idx + 1} (ID {order.id})</p>
                                    <p className="text-xs font-bold text-gray-700">{order.dropoff.address}</p>
                                  </div>
                                  <span className="text-[10px] font-black text-[#F84F39]">R$ {(order.driverEarning + (order.hasReturnFee ? (order.returnFeePrice || 0) : 0)).toFixed(2)}</span>
                                </div>

                                {order.collectionAmount && order.collectionAmount > 0 && (
                                  <div className="mt-2 bg-emerald-100 p-2.5 rounded-xl flex items-center gap-2 border border-emerald-200">
                                      <span className="text-lg">💰</span>
                                      <div className="flex-1">
                                        <p className="text-[9px] font-black text-emerald-800 uppercase tracking-widest">Cobrar do Cliente Final:</p>
                                        <p className="text-xs font-black text-emerald-700">R$ {(order.collectionAmount || 0).toFixed(2)} ({order.paymentMethodAtDelivery === 'CASH' ? 'DINHEIRO' : 'LEVAR MAQUININHA'})</p>
                                      </div>
                                  </div>
                                )}
                                
                                {order.customerPhone && (
                                  <div className="mt-2 bg-blue-50 p-2.5 rounded-xl flex items-center gap-2 border border-blue-100">
                                      <span className="text-lg">📞</span>
                                      <div className="flex-1">
                                        <p className="text-[9px] font-black text-blue-800 uppercase tracking-widest">Contato Cliente:</p>
                                        <p className="text-xs font-black text-blue-700">{order.customerPhone}</p>
                                      </div>
                                  </div>
                                )}

                                {commonStatus === OrderStatus.IN_TRANSIT && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                                      {order.requiresDeliveryCode && (
                                        <div className="relative">
                                          <input type="text" placeholder="Código de Entrega" value={deliveryCodes[order.id] || ''} onChange={e => setDeliveryCodes(prev => ({...prev, [order.id]: e.target.value}))} className="w-full text-center tracking-[0.3em] font-black text-sm px-4 py-2.5 bg-white border-2 border-gray-100 rounded-xl outline-none focus:border-[#F84F39]" />
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs">🔑</span>
                                        </div>
                                      )}
                                      <button disabled={isUpdating} onClick={() => handleFinishDelivery(order)} className={`w-full bg-emerald-500 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-100 active:scale-95 transition-all text-[10px] uppercase tracking-widest ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}>Finalizar Parada {idx + 1} ✓</button>
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                    </div>
                    
                    {commonStatus !== OrderStatus.IN_TRANSIT && (
                        <button disabled={isUpdating} onClick={handleGlobalStatusUpdate} className={`w-full jaa-gradient text-white font-black py-5 rounded-2xl shadow-xl shadow-red-100 active:scale-95 transition-all uppercase tracking-widest text-xs ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}>{getStatusActionText(commonStatus)}</button>
                    )}

                    <div className="flex gap-2">
                        <a href={`https://www.google.com/maps/dir/?api=1&origin=${profile?.currentLocation?.lat},${profile?.currentLocation?.lng}&destination=${commonStatus === OrderStatus.IN_TRANSIT ? activeOrders[0].dropoff.lat : activeOrders[0].pickup.lat},${commonStatus === OrderStatus.IN_TRANSIT ? activeOrders[0].dropoff.lng : activeOrders[0].pickup.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-gray-800 text-white py-4 rounded-xl text-center font-bold text-xs uppercase tracking-widest flex items-center justify-center">
                          {commonStatus === OrderStatus.IN_TRANSIT ? 'Maps Entrega' : 'Maps Coleta'}
                        </a>
                        <a href={`https://www.waze.com/ul?ll=${commonStatus === OrderStatus.IN_TRANSIT ? activeOrders[0].dropoff.lat : activeOrders[0].pickup.lat},${commonStatus === OrderStatus.IN_TRANSIT ? activeOrders[0].dropoff.lng : activeOrders[0].pickup.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-[#33CCFF] text-white py-4 rounded-xl text-center font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                          <img src="https://img.icons8.com/color/48/waze.png" className="h-5" alt="Waze" />
                          <span>Waze</span>
                        </a>
                    </div>
                </div>
            </div>
        ) : isReturning && returningOrders[0] ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl border-4 border-white overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                <div className="h-64"><MapView markers={mapMarkers} userLocation={profile?.currentLocation} /></div>
                <div className="p-6 space-y-6">
                    <div className="text-center">
                        <div className="inline-block bg-orange-100 text-[#F84F39] text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest mb-3">📦 Retorno Necessário</div>
                        <h3 className="text-xl font-black text-gray-800 font-jaa italic">
                          Volte para {returningOrders[0]?.pickup?.address?.split(',')[0] || 'o estabelecimento'}
                        </h3>
                        <p className="text-gray-400 text-xs mt-2">Você possui pendência de retorno para esta loja. Devolva o dinheiro/máquina para que a loja libere seu pagamento total.</p>
                    </div>

                    <div className="bg-gray-50 p-5 rounded-3xl border border-gray-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Destino do Retorno</p>
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🏪</span>
                            <p className="text-sm font-bold text-gray-700">{returningOrders[0]?.pickup?.address || 'Endereço da Loja'}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <a 
                            href={`https://www.google.com/maps/dir/?api=1&origin=${profile?.currentLocation?.lat},${profile?.currentLocation?.lng}&destination=${returningOrders[0].pickup.lat},${returningOrders[0].pickup.lng}`} 
                            target="_blank" rel="noopener noreferrer" 
                            className="bg-gray-800 text-white py-5 rounded-2xl text-center font-black text-[10px] uppercase tracking-widest shadow-lg flex flex-col items-center gap-1"
                        >
                            <span>Google Maps</span>
                            <span className="text-[8px] opacity-60">Voltar à Loja</span>
                        </a>
                        <a 
                            href={`https://www.waze.com/ul?ll=${returningOrders[0].pickup.lat},${returningOrders[0].pickup.lng}&navigate=yes`} 
                            target="_blank" rel="noopener noreferrer" 
                            className="bg-[#33CCFF] text-white py-5 rounded-2xl text-center font-black text-[10px] uppercase tracking-widest shadow-lg flex flex-col items-center gap-1"
                        >
                            <div className="flex items-center gap-1">
                                <img src="https://img.icons8.com/color/48/waze.png" className="h-4" alt="Waze" />
                                <span>Waze</span>
                            </div>
                            <span className="text-[8px] opacity-60">Voltar à Loja</span>
                        </a>
                    </div>

                    <div className="space-y-3">
                        {returningOrders[0].driverReportedReturn ? (
                          <div className="bg-emerald-100 p-5 rounded-2xl text-center border-2 border-emerald-500 animate-pulse">
                              <p className="text-emerald-700 text-xs font-black uppercase tracking-widest">Sinal enviado! ✓</p>
                              <p className="text-emerald-600 text-[10px] font-bold">Aguardando confirmação da loja...</p>
                          </div>
                        ) : (
                          <button 
                            onClick={() => onReportReturn(returningOrders[0].id)}
                            className="w-full bg-[#F84F39] text-white py-6 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 border-4 border-white"
                          >
                            🚩 JÁ ESTOU NA LOJA
                          </button>
                        )}
                        <div className="bg-emerald-50 p-4 rounded-2xl text-center border border-emerald-100">
                            <p className="text-emerald-700 text-[10px] font-black">
                              Valor pendente: R$ {((returningOrders[0]?.driverEarning || 0) + (returningOrders[0]?.returnFeePrice || 0)).toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-xl border-4 border-white overflow-hidden h-64"><MapView markers={mapMarkers} userLocation={profile?.currentLocation} /></div>
            <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="flex border-b border-gray-100 mb-2">
                <button onClick={() => setActiveTab('orders')} className={`flex-1 py-3 font-bold text-sm text-center transition-colors ${activeTab === 'orders' ? 'text-[#F84F39] border-b-2 border-[#F84F39]' : 'text-gray-400'}`}>Corridas ({cityOrders.length})</button>
                <button onClick={() => setActiveTab('scheduled')} className={`flex-1 py-3 font-bold text-sm text-center transition-colors ${activeTab === 'scheduled' ? 'text-[#F84F39] border-b-2 border-[#F84F39]' : 'text-gray-400'}`}>Agendados ({scheduledOrders.length})</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 font-bold text-sm text-center transition-colors ${activeTab === 'history' ? 'text-[#F84F39] border-b-2 border-[#F84F39]' : 'text-gray-400'}`}>Histórico</button>
              </div>
              {activeTab === 'orders' ? (
                  <div className="space-y-4 p-2 max-h-[60vh] overflow-y-auto">
                      {!isOnline ? (
                        <div className="py-20 text-center space-y-4 opacity-50">
                          <div className="text-5xl grayscale">💤</div>
                          <p className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Você está offline no momento.</p>
                          <p className="text-gray-300 text-[8px] font-bold uppercase">Ligue o interruptor acima para ver chamadas</p>
                        </div>
                      ) : cityOrders.length === 0 ? (
                        <div className="py-20 text-center space-y-3"><div className="text-4xl animate-pulse">🔍</div><p className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Buscando novas corridas em {profile?.city || 'sua região'}...</p></div>
                      ) : (
                        cityOrders.map(order => {
                          const totalGain = (order.driverEarning || 0) + (order.hasReturnFee ? (order.returnFeePrice || 0) : 0);
                          return (
                            <div key={order.id} className="bg-white border-2 border-gray-50 rounded-[2rem] p-6 shadow-lg hover:border-[#F84F39]/20 transition-all group animate-in slide-in-from-bottom-2">
                                <div className="flex justify-between items-start mb-6">
                                  <div className="space-y-1">
                                    <span className="bg-gray-100 text-gray-500 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">ID #{order.id}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl font-black text-[#F84F39]">R$ {totalGain.toFixed(2)}</span>
                                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">({(order.distance || 0).toFixed(1)} km)</span>
                                    </div>
                                    {order.hasReturnFee && (
                                        <div className="flex flex-wrap items-center gap-1 mt-1">
                                            <span className="text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-1 rounded-lg">
                                                🔄 (VALOR TOTAL INCLUSO TAXA DE RETORNO)
                                            </span>
                                        </div>
                                    )}
                                  </div>
                                  <div className="jaa-gradient text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-lg animate-pulse">NOVA</div>
                                </div>
                                <div className="relative space-y-6 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-dashed before:border-l-2 before:border-gray-200 before:z-0">
                                  <div className="flex items-start gap-4 relative z-10"><div className="w-5 h-5 bg-white border-4 border-[#0085FF] rounded-full flex-shrink-0 mt-1 shadow-sm"></div><div className="space-y-0.5"><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Ponto de Coleta</p><p className="text-xs font-bold text-gray-700 leading-tight">{order.pickup.address}</p></div></div>
                                  <div className="flex items-start gap-4 relative z-10"><div className="w-5 h-5 bg-[#F84F39] border-4 border-white rounded-full flex-shrink-0 mt-1 shadow-lg"></div><div className="space-y-0.5"><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Ponto de Entrega</p><p className="text-xs font-bold text-gray-700 leading-tight">{order.dropoff.address}</p></div></div>
                                </div>
                                <button disabled={isUpdating} onClick={async () => { if(isUpdating) return; setIsUpdating(true); try { await onUpdateStatus(order.id, OrderStatus.ACCEPTED, profile.id); } finally { setIsUpdating(false); } }} className={`w-full mt-6 bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-100 active:scale-95 transition-all uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}>ACEITAR ROTA AGORA 🛵</button>
                            </div>
                          );
                        })
                      )}
                  </div>
              ) : activeTab === 'scheduled' ? (
                <div className="space-y-4 p-2 max-h-[60vh] overflow-y-auto">
                  {scheduledOrders.length === 0 ? (
                      <div className="py-20 text-center space-y-3"><div className="text-4xl">🗓️</div><p className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Nenhuma corrida agendada.</p></div>
                  ) : (
                      scheduledOrders.map(order => {
                          const totalGain = (order.driverEarning || 0) + (order.hasReturnFee ? (order.returnFeePrice || 0) : 0);
                          return (
                            <div key={order.id} className="bg-white border-2 border-gray-50 rounded-[2rem] p-6 shadow-lg">
                                <div className="flex justify-between items-start mb-4">
                                  <div>
                                    <span className="bg-purple-100 text-purple-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Agendado Para</span>
                                    <p className="font-bold text-purple-700">{order.scheduledTime ? formatDateTime(order.scheduledTime) : 'N/A'}</p>
                                  </div>
                                  <span className="text-2xl font-black text-gray-800">R$ {totalGain.toFixed(2)}</span>
                                </div>
                                <div className="relative space-y-6 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-dashed before:border-l-2 before:border-gray-200 before:z-0">
                                  <div className="flex items-start gap-4 relative z-10"><div className="w-5 h-5 bg-white border-4 border-[#0085FF] rounded-full flex-shrink-0 mt-1 shadow-sm"></div><div className="space-y-0.5"><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Ponto de Coleta</p><p className="text-xs font-bold text-gray-700 leading-tight">{order.pickup.address}</p></div></div>
                                  <div className="flex items-start gap-4 relative z-10"><div className="w-5 h-5 bg-[#F84F39] border-4 border-white rounded-full flex-shrink-0 mt-1 shadow-lg"></div><div className="space-y-0.5"><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Ponto de Entrega</p><p className="text-xs font-bold text-gray-700 leading-tight">{order.dropoff.address}</p></div></div>
                                </div>
                                <div className="w-full mt-6 bg-gray-100 text-gray-400 text-center font-black py-3 rounded-2xl text-xs uppercase tracking-widest">
                                    Aguardando Liberação da Loja
                                </div>
                            </div>
                          );
                      })
                  )}
                </div>
              ) : (
                  <div className="space-y-3 p-2 max-h-[40vh] overflow-y-auto">
                      {driverHistory.length > 0 ? driverHistory.map(order => (
                          <div key={order.id} className="bg-gray-50 rounded-2xl p-4 flex justify-between items-center"><div><p className="text-xs font-bold">#{order.id}</p><p className="text-xs text-gray-500">{formatDateTime(order.timestamp)}</p></div><span className="font-bold text-green-600">+ R${((order.driverEarning || 0) + (order.hasReturnFee ? (order.returnFeePrice || 0) : 0)).toFixed(2)}</span></div>
                      )) : <p className="text-center text-gray-400 py-10 font-bold text-sm">Nenhuma corrida finalizada.</p>}
                  </div>
              )}
            </div>
          </div>
        )}
      </main>

      {isEditingProfile && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
            <div className="w-full max-w-lg bg-white rounded-[3rem] p-8 shadow-2xl border-4 border-white max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black font-jaa italic">Configurações e Saque</h2><button onClick={() => setIsEditingProfile(false)} className="font-bold text-gray-300">✕</button></div>
                <div className="space-y-8">
                    <div className="bg-gray-50 p-6 rounded-3xl border-2 border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Solicitar Saque (Saldo: R$ {(balance || 0).toFixed(2)})</label>
                           <button 
                             onClick={() => setWithdrawalAmount(balance > 0 ? balance.toFixed(2) : '0.00')}
                             className="text-[9px] font-black jaa-gradient text-white px-3 py-1 rounded-lg shadow-md active:scale-95 transition-all uppercase"
                           >
                             Sacar Tudo
                           </button>
                        </div>
                        {hasPendingWithdrawal ? (
                            <div className="bg-yellow-100 border border-yellow-200 text-yellow-800 text-xs font-bold text-center p-4 rounded-xl">
                                Você já possui uma solicitação de saque em andamento.
                            </div>
                        ) : (
                            <>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                       <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">R$</span>
                                       <input 
                                         type="text" 
                                         inputMode="decimal"
                                         value={withdrawalAmount} 
                                         onChange={e => {
                                           const val = e.target.value.replace(',', '.');
                                           if (/^\d*\.?\d{0,2}$/.test(val)) {
                                             setWithdrawalAmount(val);
                                           }
                                         }} 
                                         placeholder="0.00" 
                                         className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 font-bold outline-none focus:border-[#F84F39]"
                                       />
                                    </div>
                                    <button onClick={handleWithdraw} className="jaa-gradient text-white font-black px-6 py-3 rounded-xl text-[10px] uppercase shadow-lg">Sacar</button>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <p className="text-[8px] text-gray-400 font-bold uppercase">Mínimo: R$ {settings?.minimumWithdrawalAmount?.toFixed(2) || '80.00'}</p>
                                    <p className="text-[8px] text-emerald-600 font-bold uppercase">Receba em até 2 dias úteis</p>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cidade Atuação</label><input type="text" value={tempProfile.city} onChange={e => setTempProfile(p => ({ ...p, city: e.target.value }))} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold"/></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Chave PIX Saque</label><input type="text" placeholder="CPF, e-mail, celular..." value={tempProfile.pixKey} onChange={e => setTempProfile(p => ({ ...p, pixKey: e.target.value }))} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold"/></div>
                        <button onClick={handleUseGps} disabled={isGpsLoading} className="w-full text-[10px] font-black uppercase jaa-gradient text-white py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg">{isGpsLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : '🎯 Sincronizar pelo GPS'}</button>
                        <button onClick={saveProfile} className="w-full bg-gray-800 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">SALVAR ALTERAÇÕES</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODAL DE NOVA CORRIDA (FCM) - BOTTOM SHEET DESIGN */}
      {/* ============================================================================ */}
      <AnimatePresence>
        {isModalOpen && dadosNovaCorrida && (
          <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm overflow-hidden">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-md rounded-t-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              {/* Header com Recusar */}
              <div className="p-4 flex justify-end">
                <button 
                  onClick={fecharModal}
                  disabled={isAccepting}
                  className="bg-gray-100 px-6 py-2 rounded-full text-red-500 font-bold text-sm active:scale-95 transition-all"
                >
                  Recusar
                </button>
              </div>

              <div className="px-8 pb-8 flex-1 overflow-y-auto scrollbar-hide">
                {/* Área de Preço (Destaque Central) */}
                <div className="text-center mb-8">
                  <h2 className="text-6xl font-bold text-gray-900 mb-2">
                    R$ {dadosNovaCorrida.valor}
                  </h2>
                  <div className="inline-block bg-yellow-100 px-4 py-1 rounded-full mb-4">
                    <span className="text-yellow-700 font-bold text-sm">
                      R$ {dadosNovaCorrida.valorPorKm} por km
                    </span>
                  </div>
                  <div className="flex justify-center gap-8 text-gray-500 font-bold">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xl">🚩</span> {dadosNovaCorrida.distancia}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-xl">📍</span> {dadosNovaCorrida.paradas}
                    </span>
                  </div>
                </div>

                {/* Área da Rota (Timeline vertical) */}
                <div className="relative pl-8 space-y-10 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:border-l-2 before:border-dashed before:border-gray-200">
                  {/* Ponto de Coleta */}
                  <div className="relative">
                    <div className="absolute -left-8 top-0 w-6 h-6 bg-white border-2 border-blue-500 rounded flex items-center justify-center text-[10px] shadow-sm">
                      📦
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-800 text-base">
                        {dadosNovaCorrida.nomeLoja}
                      </span>
                      <span className="text-xs text-gray-500 leading-tight mt-1">
                        {dadosNovaCorrida.enderecoColeta}
                      </span>
                    </div>
                  </div>

                  {/* Ponto de Entrega */}
                  <div className="relative">
                    <div className="absolute -left-8 top-0 w-6 h-6 bg-white border-2 border-red-500 rounded-full flex items-center justify-center text-[10px] shadow-sm">
                      🚩
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-800 text-base">1ª parada</span>
                      <span className="text-xs text-gray-500 leading-tight mt-1">
                        {dadosNovaCorrida.endereco}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex gap-2 mt-10">
                  <span className="bg-gray-100 px-4 py-2 rounded-full text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                    {dadosNovaCorrida.tipoEntrega}
                  </span>
                  <span className="bg-gray-100 px-4 py-2 rounded-full text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                    {dadosNovaCorrida.metodoPagamento}
                  </span>
                </div>
              </div>

              {/* Botão Aceitar e Cronômetro */}
              <div className="p-6 bg-white border-t border-gray-50">
                <div className="flex justify-between items-center mb-3 px-2">
                  <div className="text-[10px] text-gray-300 font-bold">
                    #{dadosNovaCorrida.id}
                  </div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest ${timeLeft < 5 ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
                    Expira em {timeLeft}s
                  </div>
                </div>
                <button
                  onClick={() => aceitarCorridaDiretoDoModal(dadosNovaCorrida.id)}
                  disabled={isAccepting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-6 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-xl"
                >
                  {isAccepting ? (
                    <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    `Aceitar entrega (${timeLeft})`
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DriverDashboard;