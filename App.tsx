import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserRole, Order, OrderStatus, DriverProfile, DriverRegistrationStatus, StoreProfile, StoreRegistrationStatus, Location, RechargeRequest, RechargeRequestStatus, PlatformSettings, WithdrawalRequest, WithdrawalRequestStatus } from './types';
import StoreDashboard from './components/StoreDashboard';
import DriverDashboard from './components/DriverDashboard';
import AdminDashboard from './components/AdminDashboard';
import DriverRegistration from './components/DriverRegistration';
import StoreRegistration from './components/StoreRegistration';
import { dbService } from './services/database';
import { APP_LOGO, LOGO_SVG_FALLBACK } from './constants';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(() => {
    const savedSession = localStorage.getItem('jaa_session');
    if (savedSession) {
      try { return JSON.parse(savedSession).role; } catch (e) {}
    }
    return null;
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [view, setView] = useState<'landing' | 'store-signup' | 'driver-signup'>('landing');
  
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showStoreLogin, setShowStoreLogin] = useState(false);
  const [showDriverLogin, setShowDriverLogin] = useState(false);

  const [loginFields, setLoginFields] = useState({ taxId: '', password: '', user: '', pass: '' });
  const [loginError, setLoginError] = useState('');

  const [globalOrders, setGlobalOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>(() => {
    const cached = localStorage.getItem('jaa_cached_driver');
    return cached ? [JSON.parse(cached)] : [];
  });
  const [stores, setStores] = useState<StoreProfile[]>(() => {
    const cached = localStorage.getItem('jaa_cached_store');
    return cached ? [JSON.parse(cached)] : [];
  });
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(() => {
    const savedSession = localStorage.getItem('jaa_session');
    if (savedSession) {
      try { return JSON.parse(savedSession).driverId || null; } catch (e) {}
    }
    return null;
  });
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(() => {
    const savedSession = localStorage.getItem('jaa_session');
    if (savedSession) {
      try { return JSON.parse(savedSession).storeId || null; } catch (e) {}
    }
    return null;
  });

  const [canInstall, setCanInstall] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

  const [isAppLoading, setIsAppLoading] = useState(true);

  const lastInternalUpdate = useRef(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    dailyPrice: 10.00,
    monthlyPrice: 180.00,
    pixKey: 'pix@jaadelivery.com',
    supportWhatsapp: '5511999999999',
    minPrice: 7.0,
    pricePerKm: 2.0,
    kmFranchise: 0,
    minimumWithdrawalAmount: 80.0,
    driverEarningModel: 'PERCENTAGE',
    driverEarningPercentage: 85,
    driverEarningFixed: 7.0,
    returnFeeAmount: 5.0 
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);
  
  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    setCanInstall(false);
    setInstallPromptEvent(null);
  };

  const updateStateAndSave = useCallback(<T,>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    saver: (data: T[]) => Promise<void>,
    update: (prev: T[]) => T[]
  ) => {
    setter(prev => {
      const newState = update(prev);
      saver(newState);
      return newState;
    });
  }, []);

  const loadAllData = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Bloqueia o carregamento se houve uma atualização interna muito recente (evita flicker/reversão)
      if (Date.now() - lastInternalUpdate.current < 3000) {
        setIsSyncing(false);
        return;
      }

      await dbService.init();

      // PERF: Otimização do Fetch Inicial - Busca apenas o necessário para o papel atual
      let d: any[] = [];
      let s: any[] = [];
      let o: any[] = [];
      let r: any[] = [];
      let w: any[] = [];
      let settings: any = null;

      if (role === 'admin') {
        [d, s, o, r, w, settings] = await Promise.all([
          dbService.getDrivers(),
          dbService.getStores(),
          dbService.getOrders(),
          dbService.getRecharges(),
          dbService.getWithdrawals(),
          dbService.getSettings()
        ]);
      } else if (role === 'driver') {
        [o, settings, d, w] = await Promise.all([
          dbService.getOrders(),
          dbService.getSettings(),
          dbService.getDrivers(), // Necessário para atualizar o saldo e status do próprio motoboy
          dbService.getWithdrawals() // Necessário para ver o histórico de saques
        ]);
      } else if (role === 'store') {
        [o, settings, s, d] = await Promise.all([
          dbService.getOrders(),
          dbService.getSettings(),
          dbService.getStores(), // Necessário para atualizar o saldo da loja
          dbService.getDrivers() // Necessário para a loja ver a localização dos motoboys (MapView)
        ]);
      } else {
        // Visitante/Login
        settings = await dbService.getSettings();
      }
      
      // Verificamos novamente o timestamp antes de aplicar para evitar race conditions
      if (Date.now() - lastInternalUpdate.current < 3000) {
        setIsSyncing(false);
        return;
      }

      if (role === 'admin' || role === 'driver' || role === 'store') setDrivers(d || []);
      if (role === 'admin' || role === 'store') setStores(s || []);
      if (role !== null) setGlobalOrders(o || []);
      if (role === 'admin') setRechargeRequests(r || []);
      if (role === 'admin' || role === 'driver') setWithdrawalRequests(w || []);
      
      if (settings) {
        setPlatformSettings(prev => ({ ...prev, ...settings }));
      }
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Erro ao carregar dados do banco:", error);
    } finally {
      setIsSyncing(false); 
      setIsAppLoading(false);
    }
  }, [role]);
  
  const handleLogout = useCallback(() => { 
    setRole(null); 
    setCurrentDriverId(null); 
    setCurrentStoreId(null); 
    localStorage.removeItem('jaa_session'); 
    setView('landing'); 
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('status');
    const orderId = urlParams.get('external_reference');

    if (paymentStatus === 'approved' && orderId) {
      const pendingOrderJSON = localStorage.getItem(`mp_pending_order_${orderId}`);
      if (pendingOrderJSON) {
        try {
          const pendingOrderData: Order = JSON.parse(pendingOrderJSON);
          if (!globalOrders.some(o => o.id === orderId)) {
            pendingOrderData.timestamp = Date.now();
            pendingOrderData.status = pendingOrderData.scheduledTime 
                ? OrderStatus.SCHEDULED 
                : (pendingOrderData.preAssignedDriverId ? OrderStatus.ACCEPTED : OrderStatus.SEARCHING);
            updateStateAndSave(setGlobalOrders, dbService.saveOrders, prev => [pendingOrderData, ...prev]);
          }
          localStorage.removeItem(`mp_pending_order_${orderId}`);
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
          console.error("Erro ao processar pedido pendente do MP:", e);
          localStorage.removeItem(`mp_pending_order_${orderId}`);
        }
      }
    } else if ((paymentStatus === 'failure' || paymentStatus === 'rejected') && orderId) {
       localStorage.removeItem(`mp_pending_order_${orderId}`);
       window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [globalOrders, updateStateAndSave]);

  useEffect(() => {
    // PERF: Carregamento assíncrono do banco de dados adiado para o primeiro render
    // Isso permite que o JSX base renderize instantaneamente
    loadAllData();

    const unsubscribe = dbService.subscribe(() => {
      if (Date.now() - lastInternalUpdate.current > 3000) {
        loadAllData();
      }
    });
    return () => {
        unsubscribe();
    };
  }, [loadAllData]);
  
  // FIX: Usando ref para isSyncing para evitar recriar o setInterval a cada mudança de estado
  const isSyncingRef = useRef(isSyncing);
  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  useEffect(() => {
    // Configuração do intervalo de atualização automática para exatamente 1 segundo (1.000ms)
    const POLLING_INTERVAL = 1000; 
    
    const pollData = setInterval(() => {
      // A busca de dados ocorre em segundo plano se houver um usuário logado e não houver sincronização ativa
      // Adicionado check de timestamp para evitar sobrescrever mudanças otimistas
      if (role && !isSyncingRef.current && (Date.now() - lastInternalUpdate.current > 3000)) {
        loadAllData();
      }
    }, POLLING_INTERVAL);

    // Função de limpeza (cleanup) para cancelar o temporizador ao sair da tela ou desmontar o componente
    // Isso evita vazamentos de memória (memory leaks) e processamento desnecessário
    return () => clearInterval(pollData);
  }, [role, loadAllData]); // FIX: Removido isSyncing da dependência para evitar loop de recriação

  const handleUpdateSettingsAndSave = (newSettings: PlatformSettings) => {
    setPlatformSettings(newSettings);
    dbService.saveSettings(newSettings);
  };

  const handleLogin = async (type: 'admin' | 'store' | 'driver') => {
    setIsSyncing(true);
    setLoginError('');
    const inputTaxId = loginFields.taxId.trim().toLowerCase();
    const inputUser = loginFields.user.trim().toLowerCase();
    const inputPass = loginFields.password.trim();
    const inputAdminPass = loginFields.pass.trim();
    await new Promise(r => setTimeout(r, 600));

    if (type === 'admin') {
      const isAdmin = (inputUser === 'admin' && inputAdminPass === 'fms741741') || 
                      (inputUser === 'fabio' && inputAdminPass === '741741');
      if (isAdmin) { 
        setRole(UserRole.ADMIN); 
        setShowAdminLogin(false); 
        localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.ADMIN })); 
      } else { setLoginError('Credenciais incorretas.'); }
    } else if (type === 'driver') {
      let driver = drivers.find(d => d.taxId.trim().toLowerCase() === inputTaxId && d.password === inputPass);
      if (driver) {
        if (driver.isBlocked) {
          setLoginError(`Conta bloqueada. Motivo: ${driver.blockReason || 'Irregularidades'}. Contate o suporte.`);
          setIsSyncing(false);
          return;
        }
        setCurrentDriverId(driver.id); 
        setRole(UserRole.DRIVER); 
        setShowDriverLogin(false); 
        localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.DRIVER, driverId: driver.id })); 
        localStorage.setItem('jaa_cached_driver', JSON.stringify(driver));
      } else { setLoginError('Dados incorretos.'); }
    } else if (type === 'store') {
      let store = stores.find(s => s.taxId.trim().toLowerCase() === inputTaxId && s.password === inputPass);
      if (store) {
        if (store.isBlocked) {
          setLoginError(`Conta bloqueada. Motivo: ${store.blockReason || 'Irregularidades'}. Contate o suporte.`);
          setIsSyncing(false);
          return;
        }
        setCurrentStoreId(store.id); 
        setRole(UserRole.STORE); 
        setShowStoreLogin(false); 
        localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.STORE, storeId: store.id })); 
        localStorage.setItem('jaa_cached_store', JSON.stringify(store));
      } else { setLoginError('Dados incorretos.'); }
    }
    setIsSyncing(false);
  };

  const handleForgotPassword = () => {
    const phone = platformSettings.supportWhatsapp?.replace(/\D/g, '') || '5511999999999';
    const text = encodeURIComponent(`Olá! Esqueci minha senha no PedeJá. Meu documento/CPF é: ${loginFields.taxId}`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };
  
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus, driverId?: string) => {
    // 1. SINCRONIA COM NOTIFICAÇÕES: Se o pedido não está no estado local, busca no banco (comum em notificações rápidas)
    let currentOrders = [...globalOrders];
    let orderToUpdate = currentOrders.find(o => o.id === orderId);
    let fetchedLatest = false;
    
    if (!orderToUpdate) {
      try {
        const latest = await dbService.getOrders();
        orderToUpdate = latest.find(o => o.id === orderId);
        if (orderToUpdate) {
          currentOrders = latest;
          fetchedLatest = true;
        }
      } catch (e) {
        console.error("Erro ao buscar pedido faltante para atualização:", e);
      }
    }

    if (!orderToUpdate) {
      console.warn(`Pedido ${orderId} não encontrado para atualização.`);
      return;
    }

    const previousOrders = [...globalOrders];
    const orderGroupIds = new Set<string>([orderId]);
    
    if (status !== OrderStatus.DELIVERED) {
      if (orderToUpdate.linkedToOrderId) {
        orderGroupIds.add(orderToUpdate.linkedToOrderId);
        currentOrders.forEach(o => { if (o.linkedToOrderId === orderToUpdate!.linkedToOrderId) orderGroupIds.add(o.id); });
      } else {
        currentOrders.forEach(o => { if (o.linkedToOrderId === orderId) orderGroupIds.add(o.id); });
      }
    }

    const optimisticOrders = currentOrders.map(o => 
      orderGroupIds.has(o.id) ? { ...o, status, driverId: driverId || o.driverId } : o
    );

    // Aplica a mudança localmente primeiro
    lastInternalUpdate.current = Date.now();
    setGlobalOrders(optimisticOrders);

    try {
      // 2. VALIDAÇÃO DE ACEITE (Somente se for ACCEPTED)
      if (status === OrderStatus.ACCEPTED) {
        let latestOrder = orderToUpdate;
        
        // Se não buscamos agora há pouco, precisamos buscar para validar o aceite concorrente
        if (!fetchedLatest) {
          const latestOrders = await dbService.getOrders();
          const freshOrder = latestOrders.find(o => o.id === orderId);
          
          if (!freshOrder || freshOrder.status !== OrderStatus.SEARCHING) {
            alert('Poxa, outro motoboy foi mais rápido e pegou esta corrida!');
            setGlobalOrders(latestOrders);
            return;
          }
          latestOrder = freshOrder;
        } else {
          // Se já buscamos e o status não era SEARCHING, reverte
          if (orderToUpdate.status !== OrderStatus.SEARCHING) {
            alert('Poxa, outro motoboy foi mais rápido e pegou esta corrida!');
            setGlobalOrders(currentOrders);
            return;
          }
        }
      }

      // 3. LÓGICA FINANCEIRA (Atômica no Banco)
      if (status === OrderStatus.DELIVERED) {
        let totalToCredit = 0;
        let targetDriverId = driverId || orderToUpdate.driverId;
        
        if (targetDriverId) {
          orderGroupIds.forEach(currentOrderId => {
            const finishedOrder = optimisticOrders.find(o => o.id === currentOrderId);
            // Só credita se o pedido não estava entregue e não tem taxa de retorno pendente
            if (finishedOrder && previousOrders.find(po => po.id === currentOrderId)?.status !== OrderStatus.DELIVERED && !finishedOrder.hasReturnFee) {
              totalToCredit += (finishedOrder.driverEarning || 0);
            }
          });

          if (totalToCredit > 0) {
            await dbService.adjustDriverBalance(targetDriverId, totalToCredit);
          }
        }
      }

      // 4. PERSISTÊNCIA NO BANCO (Em segundo plano e muito mais rápida)
      const changedOrders = optimisticOrders.filter(o => orderGroupIds.has(o.id));
      await dbService.updateOrders(changedOrders);
      await dbService.saveOrders(optimisticOrders); // Garante persistência local completa e notificação entre abas
      
      // Atualiza o saldo dos drivers localmente se houve crédito
      if (status === OrderStatus.DELIVERED) {
        const d = await dbService.getDrivers();
        setDrivers(d);
      }
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      // Reverte em caso de erro crítico
      setGlobalOrders(previousOrders);
      alert("Erro ao sincronizar status. Tente novamente.");
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleCancelOrder = (orderId: string) => {
    const order = globalOrders.find(o => o.id === orderId);
    if (!order) return;
    if (order.status !== OrderStatus.CANCELED && order.status !== OrderStatus.DELIVERED) {
      const wasPaid = order.paymentReceiptUrl === 'WALLET_BALANCE' || order.paymentReceiptUrl === 'MERCADO_PAGO_PAID' || order.status !== OrderStatus.PENDING_PAYMENT_CONFIRMATION;
      if (wasPaid) {
        updateStateAndSave(setStores, dbService.saveStores, prev =>
          prev.map(s => s.id === order.storeId ? { ...s, balance: (s.balance || 0) + order.price } : s)
        );
      }
    }
    updateStateAndSave(setGlobalOrders, dbService.saveOrders, prev =>
      prev.map(o => o.id === orderId ? { ...o, status: OrderStatus.CANCELED } : o)
    );
  };

  const handleReleaseOrder = (orderId: string) => {
    const order = globalOrders.find(o => o.id === orderId);
    if (!order || order.status !== OrderStatus.SCHEDULED) return;
    updateStateAndSave(setGlobalOrders, dbService.saveOrders, prev => 
      prev.map(o => o.id === orderId ? { 
        ...o, 
        status: o.preAssignedDriverId ? OrderStatus.ACCEPTED : OrderStatus.SEARCHING,
        driverId: o.preAssignedDriverId 
      } : o)
    );
  };

  const handleResetStatistics = async () => {
    setIsSyncing(true);
    lastInternalUpdate.current = Date.now(); // Bloqueia syncs automáticos durante a limpeza profunda
    try {
      // Executa as deleções no banco de dados e aguarda confirmação real
      await Promise.all([
        dbService.clearAllOrders(),
        dbService.clearAllRecharges(),
        dbService.clearAllWithdrawals()
      ]);
      
      // Limpa os estados locais somente após confirmação do banco
      setGlobalOrders([]);
      setRechargeRequests([]);
      setWithdrawalRequests([]);
      
      alert('Histórico de pedidos e estatísticas zerados com sucesso em todo o sistema!');
    } catch (error) {
      console.error("Erro ao zerar dados:", error);
      alert("Erro ao zerar dados no banco de dados. Tente novamente.");
    } finally {
      setIsSyncing(false);
      // Força um recarregamento para garantir que a UI reflita o estado vazio do banco
      loadAllData();
    }
  };

  const handleNewWithdrawalRequest = async (driverId: string, driverName: string, amount: number) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;

    // CORREÇÃO: Deduzir o valor da carteira do motoboy imediatamente ao solicitar o saque (atômico no banco)
    const success = await dbService.adjustDriverBalance(driverId, -amount);
    
    if (success) {
      const newRequest: WithdrawalRequest = {
          id: 'w-' + Math.random().toString(36).substr(2, 6),
          driverId, driverName, amount,
          status: WithdrawalRequestStatus.PENDING,
          requestDate: Date.now(),
          driverPixKey: driver.pixKey
      };
      
      // Atualiza localmente para feedback imediato
      updateStateAndSave(setDrivers, dbService.saveDrivers, prev => 
        prev.map(d => d.id === driverId ? { ...d, balance: (d.balance || 0) - amount } : d)
      );
      
      updateStateAndSave(setWithdrawalRequests, dbService.saveWithdrawals, prev => [newRequest, ...prev]);
      
      // Força refresh para garantir sincronia total
      loadAllData();
    } else {
      alert("Erro ao processar solicitação de saque. Verifique sua conexão.");
    }
  };
  
  const handleApproveWithdrawal = (id: string) => {
    const request = withdrawalRequests.find(w => w.id === id);
    if (!request) return;
    
    // O valor já foi deduzido na solicitação (handleNewWithdrawalRequest)
    updateStateAndSave(setWithdrawalRequests, dbService.saveWithdrawals, prev =>
      prev.map(w => w.id === id ? { ...w, status: WithdrawalRequestStatus.APPROVED } : w)
    );
  };

  const handleRejectWithdrawal = async (id: string) => {
    const request = withdrawalRequests.find(w => w.id === id);
    if (!request || request.status !== WithdrawalRequestStatus.PENDING) return;
    
    // Estorna o valor para a carteira do motoboy se o saque for rejeitado
    const success = await dbService.adjustDriverBalance(request.driverId, request.amount);
    
    if (success) {
      updateStateAndSave(setWithdrawalRequests, dbService.saveWithdrawals, prev =>
        prev.map(w => w.id === id ? { ...w, status: WithdrawalRequestStatus.REJECTED } : w)
      );
      
      // Atualiza localmente para feedback imediato
      updateStateAndSave(setDrivers, dbService.saveDrivers, prev => 
        prev.map(d => d.id === request.driverId ? { ...d, balance: (d.balance || 0) + request.amount } : d)
      );
      
      loadAllData();
    } else {
      alert("Erro ao estornar saldo. Tente novamente.");
    }
  };

  const handleNewRechargeRequest = (storeId: string, amount: number, receiptUrl: string) => {
    const store = stores.find(s => s.id === storeId);
    if (!store) return;
    const newRequest: RechargeRequest = {
        id: 'r-' + Math.random().toString(36).substr(2, 6),
        storeId, storeName: store.name, amount,
        status: RechargeRequestStatus.PENDING,
        requestDate: Date.now(),
        paymentReceiptUrl: receiptUrl
    };
    updateStateAndSave(setRechargeRequests, dbService.saveRecharges, prev => [newRequest, ...prev]);
  };

  const handleApproveRecharge = (id: string) => {
    const request = rechargeRequests.find(r => r.id === id);
    if (!request) return;
    updateStateAndSave(setStores, dbService.saveStores, prev =>
      prev.map(s => s.id === request.storeId ? { ...s, balance: (s.balance || 0) + request.amount } : s)
    );
    updateStateAndSave(setRechargeRequests, dbService.saveRecharges, prev =>
      prev.map(r => r.id === id ? { ...r, status: RechargeRequestStatus.APPROVED } : r)
    );
  };

  const handleNewOrderFromStore = (order: Order) => {
    if (order.paymentReceiptUrl === 'WALLET_BALANCE') {
      const store = stores.find(s => s.id === order.storeId);
      if (store && store.balance >= order.price) {
        updateStateAndSave(setStores, dbService.saveStores, prev => 
          prev.map(s => s.id === order.storeId ? { ...s, balance: s.balance - order.price } : s)
        );
      } else {
        alert("Erro: Saldo insuficiente na carteira.");
        return;
      }
    }
    updateStateAndSave(setGlobalOrders, dbService.saveOrders, prev => [order, ...prev]);
  };

  const handleDeleteDriver = async (driverId: string) => {
    setIsSyncing(true);
    lastInternalUpdate.current = Date.now();
    try {
      await dbService.deleteDriver(driverId);
      setDrivers(prev => {
        const filtered = prev.filter(d => d.id !== driverId);
        dbService.saveDrivers(filtered);
        return filtered;
      });
      alert('Motoboy excluído permanentemente com sucesso!');
    } catch (error) {
      console.error("Erro ao excluir motoboy:", error);
      alert("Falha ao excluir no servidor. O registro não foi removido.");
    } finally {
      setIsSyncing(false);
      loadAllData();
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    setIsSyncing(true);
    lastInternalUpdate.current = Date.now();
    try {
      await dbService.deleteStore(storeId);
      setStores(prev => {
        const filtered = prev.filter(s => s.id !== storeId);
        dbService.saveStores(filtered);
        return filtered;
      });
      alert('Loja excluída permanentemente com sucesso!');
    } catch (error) {
      console.error("Erro ao excluir loja:", error);
      alert("Falha ao excluir no servidor. A loja não foi removida.");
    } finally {
      setIsSyncing(false);
      loadAllData();
    }
  };

  useEffect(() => {
    if (currentDriverId && drivers.length > 0) {
      const current = drivers.find(d => d.id === currentDriverId);
      if (current) localStorage.setItem('jaa_cached_driver', JSON.stringify(current));
    }
  }, [currentDriverId, drivers]);

  useEffect(() => {
    if (currentStoreId && stores.length > 0) {
      const current = stores.find(s => s.id === currentStoreId);
      if (current) localStorage.setItem('jaa_cached_store', JSON.stringify(current));
    }
  }, [currentStoreId, stores]);

  const currentDriver = drivers.find(d => d.id === currentDriverId);
  const currentStore = stores.find(s => s.id === currentStoreId);
  
  // Removed logout on missing profile to avoid race conditions with cache
  // useEffect(() => {
  //   if (!isLoading) {
  //     if (role === UserRole.DRIVER && currentDriverId && !currentDriver) handleLogout();
  //     if (role === UserRole.STORE && currentStoreId && !currentStore) handleLogout();
  //   }
  // }, [isLoading, role, currentDriverId, currentStoreId, currentDriver, currentStore, handleLogout]);

  const createGenericHandler = <T extends {id: string}>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    saver: (data: T[]) => Promise<void>,
    updateLogic: (item: T) => T
  ) => (id: string) => {
    updateStateAndSave(setter, saver, prev => prev.map(item => item.id === id ? updateLogic(item) : item));
  };
  
  const createGenericDataHandler = <T extends {id: string}>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    saver: (data: T[]) => Promise<void>
  ) => (id: string, data: Partial<T>) => {
    updateStateAndSave(setter, saver, prev => prev.map(item => item.id === id ? { ...item, ...data } : item));
  };
  
  const handleApproveDriver = createGenericHandler(setDrivers, dbService.saveDrivers, d => ({ ...d, status: DriverRegistrationStatus.APPROVED }));
  const handleRejectDriver = createGenericHandler(setDrivers, dbService.saveDrivers, d => ({ ...d, status: DriverRegistrationStatus.REJECTED }));
  const handleApproveStore = createGenericHandler(setStores, dbService.saveStores, s => ({ ...s, status: StoreRegistrationStatus.APPROVED }));
  const handleRejectStore = createGenericHandler(setStores, dbService.saveStores, s => ({ ...s, status: StoreRegistrationStatus.REJECTED }));
  const handleApproveAccess = (id: string, type: 'DAILY' | 'MONTHLY') => {
    const validityDays = type === 'DAILY' ? 1 : 30;
    const expiration = new Date().getTime() + validityDays * 24 * 60 * 60 * 1000;
    updateStateAndSave(setStores, dbService.saveStores, prev => prev.map(s => s.id === id ? { ...s, accessValidity: expiration, paymentProofUrl: undefined, accessRequestType: undefined } : s));
  };
  const handleRejectRecharge = createGenericHandler(setRechargeRequests, dbService.saveRecharges, r => ({ ...r, status: RechargeRequestStatus.REJECTED }));
  const handleApprovePayment = createGenericHandler(setGlobalOrders, dbService.saveOrders, o => ({ 
    ...o, 
    status: o.scheduledTime ? OrderStatus.SCHEDULED : (o.preAssignedDriverId ? OrderStatus.ACCEPTED : OrderStatus.SEARCHING), 
    driverId: o.preAssignedDriverId 
  }));
  const handleRejectPayment = createGenericHandler(setGlobalOrders, dbService.saveOrders, o => ({ ...o, status: OrderStatus.CANCELED }));
  const handleUpdateDriver = createGenericDataHandler(setDrivers, dbService.saveDrivers);
  const handleUpdateStore = createGenericDataHandler(setStores, dbService.saveStores);
  const handleUpdateOrder = createGenericDataHandler(setGlobalOrders, dbService.saveOrders);

  // NOVO FLUXO DE RETORNO BLINDADO
  const handleConfirmReturnRobust = async (orderId: string) => {
    const order = globalOrders.find(o => o.id === orderId); 
    if (!order || !order.driverId || order.returnFeePaid) return; 

    const returnFee = order.returnFeePrice || platformSettings.returnFeeAmount; 
    const deliveryFee = order.driverEarning || 0;
    const totalToRelease = deliveryFee + returnFee;

    // 1. PRIMEIRO PASSO: Tenta creditar o saldo diretamente no servidor (Atomic SQL)
    const success = await dbService.adjustDriverBalance(order.driverId, totalToRelease);

    if (success) {
      // 2. SEGUNDO PASSO: Se o crédito deu certo no servidor, atualizamos o pedido local e nuvem
      updateStateAndSave(setGlobalOrders, dbService.saveOrders, ordersPrev => 
        ordersPrev.map(o => o.id === orderId ? { ...o, returnFeePaid: true } : o)
      );
      
      // 3. TERCEIRO PASSO: Força refresh para sincronizar UI do motoboy
      loadAllData();
      
      alert(`Sucesso! R$ ${totalToRelease.toFixed(2)} creditados ao motoboy.`);
    } else {
      alert("Erro ao processar pagamento no servidor. Verifique sua conexão e tente novamente.");
    }
  };

  if (isAppLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#f7f7f7] flex flex-col items-center justify-center p-4">
        <div className="text-center animate-pulse">
          <h1 className="text-7xl md:text-8xl font-black italic tracking-tighter font-jaa select-none mb-4">
            <span className="text-[#F84F39]">Pede</span><span className="text-[#FFB800]">Já</span>
          </h1>
          <div className="w-12 h-12 border-4 border-[#F84F39] border-t-transparent rounded-full animate-spin mx-auto mt-8"></div>
        </div>
      </div>
    );
  }
  
  if (view === 'store-signup') return <StoreRegistration settings={platformSettings} onSignup={(p) => { const newStore: StoreProfile = { ...p, id: 's-' + Math.random().toString(36).substr(2,6), status: StoreRegistrationStatus.PENDING, registrationDate: new Date().toLocaleDateString(), balance: 0, deliveryRadius: 5, accessValidity: 0, minPrice: platformSettings.minPrice, pricePerKm: platformSettings.pricePerKm, returnFeeAmount: platformSettings.returnFeeAmount, driverEarningModel: platformSettings.driverEarningModel, driverEarningPercentage: platformSettings.driverEarningPercentage, driverEarningFixed: platformSettings.driverEarningFixed }; updateStateAndSave(setStores, dbService.saveStores, prev => [...prev, newStore]); setRole(UserRole.STORE); setCurrentStoreId(newStore.id); setView('landing'); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.STORE, storeId: newStore.id })); localStorage.setItem('jaa_cached_store', JSON.stringify(newStore)); }} onBack={() => setView('landing')} />;
  if (view === 'driver-signup') return <DriverRegistration onSignup={(p) => { const newDriver: DriverProfile = { ...p, id: 'd-' + Math.random().toString(36).substr(2,6), status: DriverRegistrationStatus.PENDING, registrationDate: new Date().toLocaleDateString(), balance: 0, isOnline: false }; updateStateAndSave(setDrivers, dbService.saveDrivers, prev => [...prev, newDriver]); setRole(UserRole.DRIVER); setCurrentDriverId(newDriver.id); setView('landing'); localStorage.setItem('jaa_session', JSON.stringify({ role: UserRole.DRIVER, driverId: newDriver.id })); localStorage.setItem('jaa_cached_driver', JSON.stringify(newDriver)); }} onBack={() => setView('landing')} />;

  return (
    <div className="bg-[#f7f7f7] min-h-[100dvh] overflow-x-hidden">
      {!role ? (
        <div className="min-h-[100dvh] bg-[#f7f7f7] flex flex-col items-center justify-center p-4">
          <div className="w-full max-sm bg-white rounded-[3.5rem] shadow-2xl p-10 md:p-12 flex flex-col items-center relative overflow-hidden border border-gray-100">
            <div className="mb-16 text-center relative group">
              <h1 className="text-7xl md:text-8xl font-black italic tracking-tighter font-jaa select-none">
                <span className="text-[#F84F39]">Pede</span><span className="text-[#FFB800]">Já</span>
              </h1>
              <div className="flex items-center justify-center gap-1 mt-2">
                <div className="h-1.5 w-12 bg-[#F84F39] rounded-full"></div>
                <p className="text-[#0f172a] text-[10px] font-black uppercase tracking-[0.3em]">ENTREGAS RÁPIDAS</p>
                <div className="h-1.5 w-12 bg-[#FFB800] rounded-full"></div>
              </div>
            </div>
            <div className="w-full space-y-4">
              <button onClick={() => setShowStoreLogin(true)} className="w-full jaa-gradient text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs">SOU ESTABELECIMENTO</button>
              <button onClick={() => setShowDriverLogin(true)} className="w-full bg-white border-2 border-gray-100 text-gray-800 font-black py-5 rounded-2xl uppercase tracking-widest text-xs">SOU ENTREGADOR</button>
            </div>
            <div className="mt-10 pt-8 border-t border-gray-50 w-full text-center">
              <div className="flex flex-col gap-4">
                <button onClick={() => setView('store-signup')} className="text-[#F84F39] font-black text-[10px] uppercase tracking-widest">Cadastrar Loja</button>
                <button onClick={() => setView('driver-signup')} className="text-[#FFB800] font-black text-[10px] uppercase tracking-widest">Ser um Parceiro</button>
              </div>
              <button onClick={() => setShowAdminLogin(true)} className="mt-12 text-gray-200 text-[8px] font-black uppercase tracking-widest">Painel ADM</button>
            </div>
          </div>
          {(showAdminLogin || showStoreLogin || showDriverLogin) && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
              <div className="bg-white w-full max-sm rounded-[3rem] p-8 md:p-10 shadow-2xl relative border-4 border-white">
                <button onClick={() => { setShowAdminLogin(false); setShowStoreLogin(false); setShowDriverLogin(false); setLoginError(''); }} className="absolute top-6 right-6 text-gray-300 text-xl font-bold">✕</button>
                <h2 className="text-2xl font-black text-gray-800 mb-8 tracking-tight font-jaa italic">Acesse sua conta</h2>
                <div className="space-y-4">
                  <input type="text" placeholder={showAdminLogin ? "Usuário" : "Seu Documento (taxid)"} className="w-full bg-gray-50 border-2 border-gray-100 px-6 py-4.5 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={showAdminLogin ? loginFields.user : loginFields.taxId} onChange={(e) => setLoginFields({ ...loginFields, [showAdminLogin ? 'user' : 'taxId']: e.target.value })} />
                  <input type="password" placeholder="Sua Senha" className="w-full bg-gray-50 border-2 border-gray-100 px-6 py-4.5 rounded-2xl outline-none focus:border-[#F84F39] font-bold text-sm" value={showAdminLogin ? loginFields.pass : loginFields.password} onChange={(e) => setLoginFields({ ...loginFields, [showAdminLogin ? 'pass' : 'password']: e.target.value })} />
                  {loginError && <p className="text-[#F84F39] text-xs font-black text-center">{loginError}</p>}
                  {!showAdminLogin && <button onClick={handleForgotPassword} className="w-full text-center text-[10px] font-black text-gray-400 uppercase hover:text-[#F84F39] transition-colors py-1">Esqueci a senha? Clique aqui</button>}
                  <button onClick={() => handleLogin(showAdminLogin ? 'admin' : showStoreLogin ? 'store' : 'driver')} className="w-full jaa-gradient text-white font-black py-4.5 rounded-2xl shadow-xl mt-4 uppercase tracking-widest text-xs">ENTRAR AGORA</button>
                </div>
              </div>
            </div>
          )}
           {canInstall && (
              <button onClick={handleInstallClick} className="fixed bottom-6 right-6 z-50 w-16 h-16 jaa-gradient rounded-full flex items-center justify-center text-white shadow-2xl animate-bounce"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
            )}
        </div>
      ) : (
        <div className="min-h-[100dvh]">
          {role === UserRole.STORE && ( currentStore && <StoreDashboard onLogout={handleLogout} orders={globalOrders.filter(o => o.storeId === currentStoreId)} onNewOrder={handleNewOrderFromStore} onCancelOrder={handleCancelOrder} onReleaseOrder={handleReleaseOrder} onRechargeRequest={handleNewRechargeRequest} profile={currentStore} settings={platformSettings} onlineDrivers={drivers.filter(d => d.isOnline)} onUpdateRadius={(radius) => handleUpdateStore(currentStoreId, { deliveryRadius: radius })} onAccessRequest={(id, type) => handleUpdateStore(id, { accessValidity: 0, accessRequestType: type, paymentProofUrl: 'AWAITING_ADMIN_APPROVAL' })} onUpdateProfile={handleUpdateStore} 
          onConfirmReturn={handleConfirmReturnRobust} onRefresh={loadAllData} isSyncing={isSyncing} /> )}
          {role === UserRole.DRIVER && ( currentDriver && <DriverDashboard onLogout={handleLogout} availableOrders={globalOrders.filter(o => o.status === OrderStatus.SEARCHING)} scheduledOrders={globalOrders.filter(o => o.status === OrderStatus.SCHEDULED && o.storeCity?.toLowerCase().trim() === currentDriver?.city?.toLowerCase().trim())} activeOrders={globalOrders.filter(o => o.driverId === currentDriverId && ![OrderStatus.DELIVERED, OrderStatus.CANCELED].includes(o.status))} allOrders={globalOrders} onUpdateStatus={handleUpdateOrderStatus} onReportReturn={(orderId) => handleUpdateOrder(orderId, { driverReportedReturn: true })} balance={currentDriver.balance} profile={currentDriver} settings={platformSettings} withdrawalRequests={withdrawalRequests} onNewWithdrawalRequest={handleNewWithdrawalRequest} onToggleOnline={(id, online) => handleUpdateDriver(id, { isOnline: online })} onUpdateLocation={(id, loc) => handleUpdateDriver(id, { currentLocation: loc })} onUpdateProfile={handleUpdateDriver} onRefresh={loadAllData} isSyncing={isSyncing} /> )}
          {role === UserRole.ADMIN && ( <AdminDashboard onLogout={handleLogout} orders={globalOrders} settings={platformSettings} onUpdateSettings={handleUpdateSettingsAndSave} allDrivers={drivers} onApproveDriver={handleApproveDriver} onRejectDriver={handleRejectDriver} allStores={stores} onApproveStore={handleApproveStore} onRejectStore={handleRejectStore} onApproveAccess={handleApproveAccess} rechargeRequests={rechargeRequests} onApproveRecharge={handleApproveRecharge} onRejectRecharge={handleRejectRecharge} withdrawalRequests={withdrawalRequests} onApproveWithdrawal={handleApproveWithdrawal} onRejectWithdrawal={handleRejectWithdrawal} onApprovePayment={handleApprovePayment} onRejectPayment={handleRejectPayment} onUpdateDriver={handleUpdateDriver} onUpdateStore={handleUpdateStore} onResetStatistics={handleResetStatistics} isSyncing={isSyncing} lastSyncTime={lastSyncTime} onDeleteDriver={handleDeleteDriver} onDeleteStore={handleDeleteStore} onRefresh={loadAllData} /> )}
        </div>
      )}
    </div>
  );
};

export default App;