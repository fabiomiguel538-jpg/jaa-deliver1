import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Order, OrderStatus, StoreProfile, Location, DriverProfile, PlatformSettings, StoreRegistrationStatus } from '../types';
import { APP_LOGO, LOGO_SVG_FALLBACK } from '../constants';
import MapView from './MapView';
import Checkout from './Checkout';

interface StoreDashboardProps {
  onLogout: () => void;
  orders: Order[];
  onNewOrder: (order: Order) => void;
  onCancelOrder: (id: string) => void;
  onReleaseOrder: (id: string) => void;
  onRechargeRequest: (storeId: string, amount: number, receiptUrl: string) => void;
  profile: StoreProfile;
  settings: PlatformSettings;
  onlineDrivers: DriverProfile[];
  onUpdateRadius: (radius: number) => void;
  onAccessRequest: (id: string, type: 'DAILY' | 'MONTHLY') => void;
  onUpdateProfile: (id: string, data: Partial<StoreProfile>) => void;
  onConfirmReturn: (orderId: string) => void;
  onRefresh: () => void;
  isSyncing: boolean;
}

const isValidNumber = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return !isNaN(num) && isFinite(num);
};

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

/**
 * Calcula a distância REAL de condução usando a API do OSRM (Gratuita).
 * Para usar Google Maps, substitua a URL por:
 * https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&key=SUA_CHAVE
 */
const getDrivingDistance = async (loc1: Location, loc2: Location): Promise<number> => {
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${loc1.lng},${loc1.lat};${loc2.lng},${loc2.lat}?overview=false`);
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      return data.routes[0].distance / 1000; // OSRM retorna em metros
    }
  } catch (error) {
    console.error('Erro ao calcular distância de condução:', error);
  }
  // Fallback para Haversine se a API falhar
  return calculateDistance(loc1, loc2);
};

const sanitizeCoord = (val: any, fallback: number): number => {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) || !isFinite(num) ? fallback : num;
};

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const StoreDashboard: React.FC<StoreDashboardProps> = ({ 
  onLogout, orders, onNewOrder, onCancelOrder, onReleaseOrder, onRechargeRequest, profile, settings, onlineDrivers, onUpdateRadius, onAccessRequest, onUpdateProfile, onConfirmReturn, onRefresh, isSyncing
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [isAutoAdjusting, setIsAutoAdjusting] = useState(false);
  const [activeTab, setActiveTab] = useState<'inProgress' | 'history'>('inProgress');
  
  // Estado para prevenir flickering do botão de retorno durante o sync
  const [processingReturns, setProcessingReturns] = useState<Set<string>>(new Set());

  const [deliveryCep, setDeliveryCep] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryAddressFound, setDeliveryAddressFound] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState<Location | null>(null);
  const [searchingDeliveryCep, setSearchingDeliveryCep] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [estimation, setEstimation] = useState<{ total: number; distance: number } | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'details' | 'payment'>('details');
  const [requiresCode, setRequiresCode] = useState(true);
  
  const [dropoffComplement, setDropoffComplement] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeReceipt, setRechargeReceipt] = useState<string | null>(null);

  const [collectionAmount, setCollectionAmount] = useState<string>('');
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<'CASH' | 'CARD_MACHINE' | 'NONE'>('NONE');

  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');

  const [preAssignedDriverId, setPreAssignedDriverId] = useState<string | undefined>(undefined);
  const [linkedToOrderId, setLinkedToOrderId] = useState<string | undefined>(undefined); 
  const [pendingOrderId, setPendingOrderId] = useState(() => Math.random().toString(36).substr(2, 6).toUpperCase());
  
  const [showCheckout, setShowCheckout] = useState(false);

  const [tempProfile, setTempProfile] = useState({
    name: profile?.name || '',
    cep: profile?.cep || '',
    city: profile?.city || '',
    address: profile?.address || '',
    number: profile?.number || '',
    location: profile?.location || { lat: -23.5505, lng: -46.6333 }
  });

  const activeDriversInRoute = useMemo(() => {
    const activeDriverIds = new Set(
      orders
        .filter(o => 
          o.driverId && 
          [OrderStatus.ACCEPTED, OrderStatus.PICKUP, OrderStatus.IN_TRANSIT].includes(o.status)
        )
        .map(o => o.driverId)
    );
    return onlineDrivers.filter(d => activeDriverIds.has(d.id));
  }, [orders, onlineDrivers]);

  const searchingOrders = useMemo(() => {
    return orders.filter(o => o.status === OrderStatus.SEARCHING);
  }, [orders]);

  const modalMapContainerRef = useRef<HTMLDivElement>(null);
  const modalMapRef = useRef<any>(null);
  const modalMarkerRef = useRef<any>(null);

  // FIX: Ref para verificar se o componente está montado antes de atualizar o estado em callbacks assíncronos
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleConfirmReturnLocal = (orderId: string) => {
    if (processingReturns.has(orderId)) return;
    
    // Marcar como processando localmente
    setProcessingReturns(prev => new Set(prev).add(orderId));
    
    // Chamar handler global
    onConfirmReturn(orderId);
    
    // Opcional: Remover do processamento após um tempo seguro se o sync não tiver completado
    setTimeout(() => {
      if (isMountedRef.current) {
        setProcessingReturns(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    }, 5000);
  };

  useEffect(() => {
    // Sincronização automática removida conforme solicitação.
    // Agora a localização é 100% manual via botão de alvo.
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
               number: data.address.house_number || prev.number,
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
      const query = encodeURIComponent(`${tempProfile.address}, ${tempProfile.number}, ${tempProfile.city}, Brazil`);
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

  const handleEstimate = async () => {
    if (!deliveryLocation || !safeStoreLocation) return;
    if (isScheduling && !scheduledTime) {
      alert("Por favor, selecione uma data e hora para o agendamento.");
      return;
    }

    setIsCalculating(true);
    
    try {
      const dist = await getDrivingDistance(safeStoreLocation, deliveryLocation);
      const activeMinPrice = profile.minPrice ?? settings.minPrice ?? 7;
      const activePricePerKm = profile.pricePerKm ?? settings.pricePerKm ?? 2;
      const activeKmFranchise = profile.kmFranchise ?? settings.kmFranchise ?? 0;
      const activeReturnFee = profile.returnFeeAmount ?? settings.returnFeeAmount ?? 5;
      const includeReturn = deliveryPaymentMethod !== 'NONE';

      const billableDist = Math.max(0, dist - activeKmFranchise);
      const calculated = activeMinPrice + (billableDist * activePricePerKm);
      const baseTotal = Math.max(activeMinPrice, calculated);
      const finalTotal = includeReturn ? baseTotal + activeReturnFee : baseTotal;
      
      setEstimation({ total: finalTotal, distance: dist });
      setPaymentStep('payment');
    } catch (error) {
      console.error('Erro na estimativa:', error);
      alert('Erro ao calcular a distância. Tente novamente.');
    } finally {
      setIsCalculating(false);
    }
  };

  const createOrder = (paymentType: 'MANUAL' | 'WALLET') => {
    if (!estimation || !deliveryLocation) return;
    
    if (paymentType === 'MANUAL' && !paymentReceipt) {
       alert("Por favor, anexe o comprovante PIX.");
       return;
    }

    const includeReturn = deliveryPaymentMethod !== 'NONE';
    const activeReturnFee = profile.returnFeeAmount ?? settings.returnFeeAmount ?? 5;
    const basePriceForSplit = includeReturn ? estimation.total - activeReturnFee : estimation.total;
    
    // Usar configurações da loja com fallback para as do sistema
    const activeEarningModel = profile.driverEarningModel ?? settings.driverEarningModel ?? 'PERCENTAGE';
    const activeEarningPercentage = profile.driverEarningPercentage ?? settings.driverEarningPercentage ?? 85;
    const activeEarningFixed = profile.driverEarningFixed ?? settings.driverEarningFixed ?? 7.0;

    let driverReceives = 0;

    if (activeEarningModel === 'PERCENTAGE') {
      driverReceives = basePriceForSplit * (activeEarningPercentage / 100);
    } else { 
      driverReceives = Math.max(0, basePriceForSplit - activeEarningFixed);
    }

    const streetInfo = deliveryAddressFound.split(': ')[1] || deliveryAddressFound;
    const finalAddress = `${streetInfo}, ${deliveryNumber}${dropoffComplement ? ` - ${dropoffComplement}` : ''}`;
    
    const newOrder: Order = {
      id: pendingOrderId,
      storeId: profile.id,
      storeCity: profile.city || '', 
      status: paymentType === 'MANUAL' 
        ? OrderStatus.PENDING_PAYMENT_CONFIRMATION
        : (isScheduling 
            ? OrderStatus.SCHEDULED
            : (preAssignedDriverId ? OrderStatus.ACCEPTED : OrderStatus.SEARCHING)),
      pickup: safeStoreLocation,
      dropoff: { ...deliveryLocation, address: finalAddress },
      price: estimation.total,
      driverEarning: driverReceives,
      distance: estimation.distance,
      timestamp: Date.now(),
      scheduledTime: isScheduling ? new Date(scheduledTime).getTime() : undefined,
      deliveryCode: Math.floor(1000 + Math.random() * 9000).toString(),
      requiresDeliveryCode: requiresCode,
      paymentReceiptUrl: paymentType === 'WALLET' ? 'WALLET_BALANCE' : paymentReceipt || '',
      hasReturnFee: includeReturn,
      returnFeePrice: includeReturn ? activeReturnFee : 0,
      returnFeePaid: false,
      preAssignedDriverId: preAssignedDriverId,
      linkedToOrderId: linkedToOrderId, 
      driverId: paymentType === 'WALLET' ? preAssignedDriverId : undefined,
      collectionAmount: deliveryPaymentMethod !== 'NONE' ? parseFloat(collectionAmount || '0') : 0,
      paymentMethodAtDelivery: deliveryPaymentMethod,
      dropoffComplement: dropoffComplement,
      customerPhone: customerPhone,
    };
    onNewOrder(newOrder);

    // Disparar notificação para o motoboy via Netlify Function
    if (preAssignedDriverId) {
      const driver = onlineDrivers.find(d => d.id === preAssignedDriverId);
      console.log(`Tentando notificar motorista pré-atribuído: ${preAssignedDriverId}. Encontrado: ${!!driver}, Tem Token: ${!!driver?.fcmToken}`);
      if (driver && driver.fcmToken) {
        fetch('/api/dispararNotificacao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenFCM: driver.fcmToken,
            dadosDoPedido: newOrder
          })
        })
        .then(res => res.json())
        .then(data => console.log('Resposta da notificação:', data))
        .catch(err => console.error('Erro ao disparar notificação:', err));
      }
    } else {
      // Se não tem motoboy pré-atribuído, notifica todos os motoboys online da cidade
      const cityDrivers = onlineDrivers.filter(d => (d.city || "").toLowerCase().trim() === (profile.city || "").toLowerCase().trim());
      console.log(`Notificando ${cityDrivers.length} motoristas na cidade ${profile.city}`);
      cityDrivers.forEach(driver => {
        if (driver.fcmToken) {
          fetch('/api/dispararNotificacao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tokenFCM: driver.fcmToken,
              dadosDoPedido: newOrder
            })
          })
          .then(res => res.json())
          .then(data => console.log(`Resposta da notificação para ${driver.id}:`, data))
          .catch(err => console.error('Erro ao disparar notificação:', err));
        }
      });
    }

    resetRequest();
  };

  const handleMercadoPagoInit = () => {
    if (!estimation || !deliveryLocation) return;
    
    const includeReturn = deliveryPaymentMethod !== 'NONE';
    const activeReturnFee = profile.returnFeeAmount ?? settings.returnFeeAmount ?? 5;
    const basePriceForSplit = includeReturn ? estimation.total - activeReturnFee : estimation.total;
    
    // Usar configurações da loja com fallback para as do sistema
    const activeEarningModel = profile.driverEarningModel ?? settings.driverEarningModel ?? 'PERCENTAGE';
    const activeEarningPercentage = profile.driverEarningPercentage ?? settings.driverEarningPercentage ?? 85;
    const activeEarningFixed = profile.driverEarningFixed ?? settings.driverEarningFixed ?? 7.0;

    let driverReceives = 0;

    if (activeEarningModel === 'PERCENTAGE') {
      driverReceives = basePriceForSplit * (activeEarningPercentage / 100);
    } else { 
      driverReceives = Math.max(0, basePriceForSplit - activeEarningFixed);
    }

    const streetInfo = deliveryAddressFound.split(': ')[1] || deliveryAddressFound;
    const finalAddress = `${streetInfo}, ${deliveryNumber}${dropoffComplement ? ` - ${dropoffComplement}` : ''}`;
    
    const pendingOrderData: Omit<Order, 'status' | 'timestamp'> & { status?: OrderStatus, timestamp?: number } = {
      id: pendingOrderId,
      storeId: profile.id,
      storeCity: profile.city || '',
      pickup: safeStoreLocation,
      dropoff: { ...deliveryLocation, address: finalAddress },
      price: estimation.total,
      driverEarning: driverReceives,
      distance: estimation.distance,
      scheduledTime: isScheduling ? new Date(scheduledTime).getTime() : undefined,
      deliveryCode: Math.floor(1000 + Math.random() * 9000).toString(),
      requiresDeliveryCode: requiresCode,
      paymentReceiptUrl: 'MERCADO_PAGO_PAID',
      hasReturnFee: includeReturn,
      returnFeePrice: includeReturn ? activeReturnFee : 0,
      returnFeePaid: false,
      preAssignedDriverId: preAssignedDriverId,
      linkedToOrderId: linkedToOrderId,
      driverId: preAssignedDriverId,
      collectionAmount: deliveryPaymentMethod !== 'NONE' ? parseFloat(collectionAmount || '0') : 0,
      paymentMethodAtDelivery: deliveryPaymentMethod,
      dropoffComplement: dropoffComplement,
      customerPhone: customerPhone,
    };

    localStorage.setItem(`mp_pending_order_${pendingOrderId}`, JSON.stringify(pendingOrderData));
    setShowCheckout(true);
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'ORDER' | 'RECHARGE') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'ORDER') setPaymentReceipt(reader.result as string);
        else setRechargeReceipt(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWalletRecharge = () => {
    const amt = parseFloat(rechargeAmount);
    if (isNaN(amt) || amt <= 0 || !rechargeReceipt) {
        alert("Preencha o valor e anexe o comprovante.");
        return;
    }
    onRechargeRequest(profile.id, amt, rechargeReceipt);
    setRechargeAmount('');
    setRechargeReceipt(null);
    setIsWalletOpen(false);
    alert("Solicitação de recarga enviada! Aguarde a aprovação do administrador.");
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
    setRequiresCode(true);
    setPreAssignedDriverId(undefined);
    setLinkedToOrderId(undefined); 
    setCollectionAmount('');
    setDeliveryPaymentMethod('NONE');
    setDropoffComplement('');
    setCustomerPhone('');
    setIsScheduling(false);
    setScheduledTime('');
    setShowCheckout(false);
    setPendingOrderId(Math.random().toString(36).substr(2, 6).toUpperCase());
  };

  const handleCancelWithRefund = (order: Order) => {
    if (window.confirm(`Deseja realmente cancelar este pedido? O valor de R$ ${order.price.toFixed(2)} será estornado automaticamente como crédito em sua carteira.`)) {
      onCancelOrder(order.id);
      window.alert(`Pedido cancelado com sucesso! R$ ${order.price.toFixed(2)} foram devolvidos ao seu saldo.`);
    }
  };

  const safeStoreLocation = {
    lat: isValidNumber(profile.location?.lat) ? Number(profile.location.lat) : -23.5505,
    lng: isValidNumber(profile.location?.lng) ? Number(profile.location.lng) : -46.6333
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
      case OrderStatus.SCHEDULED: return { text: "Agendado", color: "bg-purple-100 text-purple-800" };
      case OrderStatus.ACCEPTED:
      case OrderStatus.PICKUP:
      case OrderStatus.IN_TRANSIT:
        return { text: "Em Rota", color: "bg-orange-100 text-orange-800" };
      case OrderStatus.DELIVERED: return { text: "Entregue", color: "bg-emerald-100 text-emerald-800" };
      case OrderStatus.CANCELED: return { text: "Cancelado", color: "bg-red-100 text-red-800" };
      default: return { text: status, color: "bg-gray-100 text-gray-800" };
    }
  };

  if (profile.status !== StoreRegistrationStatus.APPROVED) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#f7f7f7] p-8 text-center">
        <div className="w-24 h-24 jaa-gradient rounded-[2rem] flex items-center justify-center text-white text-4xl shadow-2xl mb-8 relative overflow-hidden">
          <span className="relative z-10">🏪</span>
          <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
        </div>
        
        <div className="space-y-4 max-w-sm">
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-none">
            Seu estabelecimento <br/> está em análise
          </h1>
          <p className="text-gray-500 text-sm font-medium leading-relaxed">
            Aguarde a aprovação do administrador para acessar o painel e começar a gerenciar seus pedidos.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={onRefresh}
            disabled={isSyncing}
            className="w-full py-4 bg-white text-gray-800 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-sm border border-gray-100 hover:shadow-md active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            {isSyncing ? 'Verificando...' : 'Verificar Aprovação'}
          </button>
          
          <button 
            onClick={onLogout}
            className="w-full py-4 text-gray-400 font-bold uppercase tracking-widest text-[9px] hover:text-red-500 transition-colors"
          >
            Sair da Conta
          </button>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200 w-full max-w-xs">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">Pede Já • Delivery</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#f7f7f7] font-sans">
      <header className="sticky top-0 bg-white px-6 py-4 flex justify-between items-center border-b border-gray-100 z-[40] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 jaa-gradient rounded-xl flex items-center justify-center text-white font-black text-xs shadow-md overflow-hidden relative">
            <span className="font-jaa italic">PJ</span>
            <img 
              src={APP_LOGO} 
              alt="Logo" 
              className="absolute inset-0 w-full h-full object-contain p-1.5" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div>
            <h2 className="text-xs font-black text-gray-800 uppercase tracking-tighter">{profile.name}</h2>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-[#0085FF] font-black uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded">{profile.city}</span>
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsWalletOpen(true)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-black text-[9px] uppercase shadow-sm border border-emerald-100 flex items-center gap-1.5">
            <span>R$ {(profile.balance || 0).toFixed(2)}</span>
            <span className="text-[10px]">💳</span>
          </button>
          {/* Botão de atualização oculto conforme solicitado */}
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
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Opções da Conta</p>
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
                          <div className="text-right">
                             <span className="text-2xl font-black text-[#F84F39]">R$ {(order.price || 0).toFixed(2)}</span>
                             {order.hasReturnFee && <p className="text-[8px] font-black text-blue-500 uppercase">COM TAXA DE RETORNO</p>}
                             {order.collectionAmount && order.collectionAmount > 0 && (
                                <p className="text-[9px] font-black text-emerald-600 uppercase mt-1">A cobrar: R$ {(order.collectionAmount || 0).toFixed(2)}</p>
                             )}
                          </div>
                        </div>
                        {order.status === OrderStatus.SCHEDULED && order.scheduledTime && (
                           <div className="text-center bg-purple-50 text-purple-700 p-2 rounded-xl mb-3">
                              <p className="text-[9px] font-black uppercase">Agendado para:</p>
                              <p className="text-xs font-bold">{formatDateTime(order.scheduledTime)}</p>
                           </div>
                        )}
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl"><div className="text-lg">📍</div><p className="text-xs font-bold text-gray-700 truncate flex-1">{order.dropoff.address}</p></div>
                        {order.customerPhone && (
                            <div className="flex items-center gap-3 bg-blue-50 p-2 mt-2 rounded-xl">
                                <div className="text-lg">📱</div>
                                <p className="text-xs font-bold text-blue-700">{order.customerPhone}</p>
                            </div>
                        )}
                        <div className="flex gap-2 mt-4">
                          {order.status === OrderStatus.SEARCHING ? <button onClick={() => handleCancelWithRefund(order)} className="flex-1 bg-red-50 text-red-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-colors">Cancelar e Receber Estorno</button> 
                          : order.status === OrderStatus.SCHEDULED ? <button onClick={() => onReleaseOrder(order.id)} className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-colors">Liberar para Entrega</button>
                          : <div className={`flex-1 ${!order.driverId ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'} py-3 rounded-xl font-black text-[10px] text-center uppercase tracking-widest`}>{!order.driverId ? 'Aguardando' : 'Motoboy em Rota'}</div>}
                          
                          {order.status !== OrderStatus.PENDING_PAYMENT_CONFIRMATION && order.status !== OrderStatus.SCHEDULED && order.requiresDeliveryCode && (
                            <div className="bg-gray-800 text-white px-5 py-3 rounded-xl font-black text-lg flex items-center justify-center gap-2"><span className="text-[8px] text-gray-400 uppercase">Cód:</span><span className="text-[#FFB800]">{order.deliveryCode}</span></div>
                          )}
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
                    historyOrders.map(order => {
                       const isBeingProcessed = processingReturns.has(order.id);
                       const isAlreadyPaid = order.returnFeePaid;

                       return (
                        <div key={order.id} className="bg-gray-50/50 rounded-2xl p-4 space-y-3 transition-all duration-500">
                          <div className="flex justify-between items-center">
                             <div>
                               <p className="text-xs font-bold text-gray-800">Pedido #{order.id} <span className="text-gray-400 font-medium">({formatDateTime(order.timestamp)})</span></p>
                               <h4 className={`text-[10px] font-black px-2 py-0.5 mt-1 rounded-full inline-block ${getStatusInfo(order.status).color}`}>{getStatusInfo(order.status).text}</h4>
                             </div>
                             <span className="text-lg font-black text-gray-600">R$ {(order.price || 0).toFixed(2)}</span>
                          </div>
                          
                          {order.status === OrderStatus.DELIVERED && order.hasReturnFee && !isAlreadyPaid && (
                            <div className="relative group">
                              {order.driverReportedReturn && !isBeingProcessed && (
                                 <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-black px-3 py-1 rounded-full shadow-lg z-10 animate-bounce flex items-center gap-1 border-2 border-white">
                                   🚩 MOTOBOY CHEGOU!
                                 </div>
                              )}
                              <button 
                                disabled={isBeingProcessed}
                                onClick={() => handleConfirmReturnLocal(order.id)}
                                className={`w-full text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${isBeingProcessed ? 'bg-gray-400' : order.driverReportedReturn ? 'bg-emerald-500 ring-4 ring-emerald-100 animate-pulse' : 'bg-blue-500 shadow-blue-100'}`}
                              >
                                {isBeingProcessed ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    PROCESSANDO...
                                  </>
                                ) : order.driverReportedReturn ? 'MOTOBOY NA LOJA - LIBERAR AGORA' : `Motoboy Voltou? Liberar Pagamento Total`}
                              </button>
                            </div>
                          )}
                          
                          {isAlreadyPaid && (
                            <div className="w-full bg-emerald-50 text-emerald-600 py-2 rounded-xl text-center text-[8px] font-black uppercase border border-emerald-100 animate-in fade-in">
                              Pagamento Total Liberado ✓
                            </div>
                          )}
                        </div>
                       );
                    })
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {isWalletOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
            <div className="w-full max-md bg-white rounded-[3rem] p-8 shadow-2xl relative border-4 border-white animate-in zoom-in-95">
                <button onClick={() => setIsWalletOpen(false)} className="absolute top-6 right-6 text-gray-300 text-xl font-bold">✕</button>
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-sm">💳</div>
                    <h2 className="text-2xl font-black text-gray-800 font-jaa italic">Minha Carteira</h2>
                    <div className="mt-4 p-4 bg-emerald-500 rounded-2xl text-white">
                        <p className="text-[10px] font-black uppercase opacity-80">Saldo Disponível</p>
                        <p className="text-4xl font-black">R$ {(profile.balance || 0).toFixed(2)}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Recarregar Saldo via PIX</h3>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
                        <p className="text-[9px] font-bold text-gray-500 uppercase mb-2">Chave PIX Administrador</p>
                        <p className="text-xs font-black text-[#F84F39] select-all">{settings.pixKey}</p>
                    </div>

                    <div className="space-y-3">
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-emerald-500">R$</span>
                            <input type="number" step="0.01" value={rechargeAmount} onChange={e => setRechargeAmount(e.target.value)} placeholder="0.00" className="w-full pl-10 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-sm outline-none focus:border-emerald-500" />
                        </div>
                        
                        {!rechargeReceipt ? (
                            <label className="w-full block text-center bg-white border-2 border-dashed border-emerald-200 text-emerald-600 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest cursor-pointer hover:bg-emerald-50 transition-all">
                                ANEXAR COMPROVANTE PIX
                                <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'RECHARGE')} />
                            </label>
                        ) : (
                            <div className="space-y-2">
                                <img src={rechargeReceipt} alt="Comprovante" className="w-full h-32 object-cover rounded-2xl border-2 border-emerald-500 shadow-md" />
                                <button onClick={() => setRechargeReceipt(null)} className="text-[8px] font-bold text-red-500 uppercase w-full text-center">Remover foto</button>
                            </div>
                        )}
                        
                        <button onClick={handleWalletRecharge} className="w-full jaa-gradient text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all">SOLICITAR RECARGA</button>
                    </div>
                </div>
            </div>
        </div>
      )}

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
                   <div className="grid grid-cols-3 gap-3">
                     <div className="col-span-2 space-y-1">
                       <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Endereço</label>
                       <input type="text" className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm outline-none" value={tempProfile.address} onChange={e => setTempProfile({...tempProfile, address: e.target.value})} />
                     </div>
                     <div className="space-y-1">
                       <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Número</label>
                       <input type="text" className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm outline-none focus:border-[#F84F39]" value={tempProfile.number} onChange={e => setTempProfile({...tempProfile, number: e.target.value})} />
                     </div>
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
          <div className="w-full max-sm bg-white rounded-[3rem] p-8 shadow-2xl border-4 border-white animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
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
                 
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Complemento (Opcional)</label>
                    <input type="text" placeholder="Apto, Bloco, Casa, Ponto de Ref." className="w-full px-5 py-4 bg-gray-50 rounded-2xl outline-none font-bold border-2 border-gray-100 focus:border-[#F84F39] text-sm" value={dropoffComplement} onChange={(e) => setDropoffComplement(e.target.value)} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp/Telefone do Cliente (Opcional)</label>
                    <input type="tel" placeholder="(00) 90000-0000" className="w-full px-5 py-4 bg-gray-50 rounded-2xl outline-none font-bold border-2 border-gray-100 focus:border-[#F84F39] text-sm" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                 </div>

                 <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 space-y-4">
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block text-center">Cobrar valor do cliente?</label>
                    <div className="flex bg-white p-1 rounded-xl border border-emerald-100">
                       <button onClick={() => setDeliveryPaymentMethod('CASH')} className={`flex-1 py-3 text-[8px] font-black uppercase rounded-lg transition-all ${deliveryPaymentMethod === 'CASH' ? 'bg-emerald-500 text-white shadow-md' : 'text-emerald-400'}`}>Dinheiro</button>
                       <button onClick={() => setDeliveryPaymentMethod('CARD_MACHINE')} className={`flex-1 py-3 text-[8px] font-black uppercase rounded-lg transition-all ${deliveryPaymentMethod === 'CARD_MACHINE' ? 'bg-emerald-500 text-white shadow-md' : 'text-emerald-400'}`}>Máquina</button>
                       <button onClick={() => {setDeliveryPaymentMethod('NONE'); setCollectionAmount('');}} className={`flex-1 py-3 text-[8px] font-black uppercase rounded-lg transition-all ${deliveryPaymentMethod === 'NONE' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-400'}`}>Não</button>
                    </div>
                    {deliveryPaymentMethod !== 'NONE' && (
                       <div className="animate-in slide-in-from-top-2">
                          <label className="text-[9px] font-black text-emerald-600 uppercase tracking-widest ml-1 mb-1 block">Quanto cobrar?</label>
                          <div className="relative">
                             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">R$</span>
                             <input type="number" step="0.01" value={collectionAmount} onChange={e => setCollectionAmount(e.target.value)} placeholder="0.00" className="w-full pl-10 pr-4 py-3 bg-white border-2 border-emerald-200 rounded-xl font-bold text-sm outline-none focus:border-emerald-500" />
                          </div>
                       </div>
                    )}
                 </div>

                 <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                    <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest block mb-2 text-center">Agendar Pedido?</label>
                    <div className="flex bg-white p-1 rounded-xl border border-purple-100">
                        <button onClick={() => setIsScheduling(false)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${!isScheduling ? 'bg-purple-500 text-white shadow-md' : 'text-purple-400'}`}>Agora</button>
                        <button onClick={() => setIsScheduling(true)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${isScheduling ? 'bg-purple-500 text-white shadow-md' : 'text-purple-400'}`}>Agendar</button>
                    </div>
                    {isScheduling && (
                        <div className="mt-3 animate-in fade-in">
                            <label className="text-[9px] font-black text-purple-600 uppercase tracking-widest ml-1 mb-1 block">Data e Hora da Coleta</label>
                            <input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-purple-200 rounded-xl font-bold text-sm outline-none focus:border-purple-500"/>
                        </div>
                    )}
                 </div>

                 <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 text-center">Exigir Código de Entrega?</label>
                    <div className="flex bg-white p-1 rounded-xl border border-gray-100">
                       <button onClick={() => setRequiresCode(true)} className={`flex-1 py-3 text-[9px] font-black uppercase rounded-lg transition-all ${requiresCode ? 'jaa-gradient text-white shadow-md' : 'text-gray-400'}`}>Sim (Seguro)</button>
                       <button onClick={() => setRequiresCode(false)} className={`flex-1 py-3 text-[9px] font-black uppercase rounded-lg transition-all ${!requiresCode ? 'bg-gray-800 text-white shadow-md' : 'text-gray-400'}`}>Não (Rápido)</button>
                    </div>
                 </div>
                 
                 {deliveryAddressFound && <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${deliveryAddressFound.includes('não') || deliveryAddressFound.includes('Erro') ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>{deliveryAddressFound}</div>}
                 <button disabled={!deliveryLocation || isCalculating} onClick={handleEstimate} className="w-full jaa-gradient text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl disabled:opacity-30 flex items-center justify-center gap-2">{isCalculating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'CALCULAR VALOR'}</button>
              </div>
            ) : (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-100 text-center space-y-4">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-black mb-1">Valor do Frete {deliveryPaymentMethod !== 'NONE' && '(Com Retorno)'}</p>
                    <span className="text-[#F84F39] font-black text-4xl">R$ {(estimation?.total || 0).toFixed(2)}</span>
                    {deliveryPaymentMethod !== 'NONE' && (
                       <p className="text-[10px] font-black text-emerald-600 uppercase mt-2">💰 O motoboy cobrará R$ {(parseFloat(collectionAmount) || 0).toFixed(2)} do cliente</p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-gray-100 text-left">
                     <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">Vincular a Rota ou Motoboy?</label>
                     <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        <button onClick={() => { setPreAssignedDriverId(undefined); setLinkedToOrderId(undefined); }} className={`w-full text-left p-3 rounded-xl text-[10px] font-bold border transition-all ${(!preAssignedDriverId && !linkedToOrderId) ? 'border-[#F84F39] bg-orange-50 text-[#F84F39]' : 'border-gray-100 bg-white text-gray-400'}`}>Sem vínculo (Chamar qualquer um)</button>
                        {searchingOrders.length > 0 && searchingOrders.map(so => (
                          <button key={`link-${so.id}`} onClick={() => { setLinkedToOrderId(so.id); setPreAssignedDriverId(undefined); }} className={`w-full text-left p-3 rounded-xl text-[10px] font-bold border transition-all flex justify-between items-center ${linkedToOrderId === so.id ? 'border-[#F84F39] bg-orange-50 text-[#F84F39]' : 'border-gray-100 bg-white text-gray-500'}`}><div className="flex flex-col"><span>Agrupar c/ Pedido #{so.id}</span><span className="text-[7px] text-gray-400 font-normal">Buscando Entregador...</span></div>{linkedToOrderId === so.id && <span>✓</span>}</button>
                        ))}
                        {activeDriversInRoute.length > 0 && activeDriversInRoute.map(driver => (
                          <button key={`driver-${driver.id}`} onClick={() => { setPreAssignedDriverId(driver.id); setLinkedToOrderId(undefined); }} className={`w-full text-left p-3 rounded-xl text-[10px] font-bold border transition-all flex justify-between items-center ${preAssignedDriverId === driver.id ? 'border-[#F84F39] bg-orange-50 text-[#F84F39]' : 'border-gray-100 bg-white text-gray-500'}`}><div className="flex flex-col"><span>{driver.name}</span><span className="text-[7px] text-gray-400 font-normal">Já está em Rota p/ você</span></div>{preAssignedDriverId === driver.id && <span>✓</span>}</button>
                        ))}
                     </div>
                  </div>

                  <div className="space-y-3">
                    <button 
                        disabled={(profile.balance || 0) < (estimation?.total || 0)}
                        onClick={() => createOrder('WALLET')}
                        className="w-full bg-emerald-500 text-white font-black py-5 rounded-2xl shadow-xl disabled:opacity-30 disabled:grayscale active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-3"
                    >
                        <span>{isScheduling ? 'AGENDAR' : 'PAGAR'} COM CARTEIRA (R$ {(profile.balance || 0).toFixed(2)})</span>
                        <span className="text-xl">💳</span>
                    </button>

                    <button onClick={handleMercadoPagoInit} className="w-full bg-[#009EE3] text-white font-black py-5 rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all text-sm uppercase tracking-widest"><img src="https://img.icons8.com/color/48/000000/mercadopago.png" className="h-6" alt="MP" />{isScheduling ? 'AGENDAR' : 'PAGAR'} AGORA (MERCADO PAGO)</button>
                    <div className="flex items-center gap-2 py-2"><div className="h-[1px] flex-1 bg-gray-200"></div><span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">ou PIX Manual</span><div className="h-[1px] flex-1 bg-gray-200"></div></div>
                    {!paymentReceipt ? (
                      <label className="w-full block text-center bg-white border-2 border-gray-100 text-gray-400 py-3 rounded-xl font-black uppercase text-[9px] tracking-widest shadow-sm cursor-pointer hover:border-[#F84F39]/50 transition-colors">ANEXAR COMPROVANTE PIX<input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'ORDER')} /></label>
                    ) : (
                      <div className="text-center"><img src={paymentReceipt} alt="Comprovante" className="rounded-xl mx-auto max-h-40 mb-2 border-2 border-emerald-400 shadow-lg" /><button onClick={() => createOrder('MANUAL')} className="w-full bg-emerald-500 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all">ENVIAR PARA VALIDAÇÃO</button></div>
                    )}
                  </div>
                </div>
                <p className="text-center text-[9px] text-gray-400 font-bold uppercase cursor-pointer" onClick={() => setPaymentStep('details')}>Corrigir endereço</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showCheckout && estimation && (
        <Checkout amount={estimation.total} orderId={pendingOrderId} onCancel={() => setShowCheckout(false)} />
      )}
    </div>
  );
};

export default StoreDashboard;