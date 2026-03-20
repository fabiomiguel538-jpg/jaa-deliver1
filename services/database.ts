import { neon } from '@neondatabase/serverless';
import { Order, DriverProfile, StoreProfile, RechargeRequest, PlatformSettings, WithdrawalRequest, OrderStatus, DriverRegistrationStatus, StoreRegistrationStatus } from '../types';

const databaseUrl = 'postgresql://neondb_owner:npg_Pynw4DFcu2oz@ep-summer-fire-ahg7bdxc.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Instância única para evitar overhead de reconexão constante
const sqlClient = databaseUrl ? neon(databaseUrl) : null;

const syncChannel = new BroadcastChannel('jaa_delivery_sync');

const DEFAULT_SETTINGS: PlatformSettings = {
  dailyPrice: 10.00,
  monthlyPrice: 180.00,
  pixKey: 'pix@jaadelivery.com',
  minPrice: 7.0,
  pricePerKm: 2.0,
  kmFranchise: 0,
  minimumWithdrawalAmount: 80.0,
  driverEarningModel: 'PERCENTAGE',
  driverEarningPercentage: 85,
  driverEarningFixed: 7.0,
  returnFeeAmount: 5.0
};

const CLOUD_ORDER_LIMIT = 100;

export async function executeSql(query: string, params: any[] = [], retries = 3): Promise<any[]> {
  if (!sqlClient) return [];
  
  for (let i = 0; i < retries; i++) {
    try {
      const result = await sqlClient.query(query, params);
      return result as any[];
    } catch (error: any) {
      const errorMessage = error.message || "";
      const isNetworkError = errorMessage.includes('Failed to fetch') || errorMessage.includes('Load failed') || errorMessage.includes('NetworkError');
      const isDeadlock = errorMessage.includes('deadlock detected');
      
      if ((isNetworkError || isDeadlock) && i < retries - 1) {
        const delay = isDeadlock ? (300 + Math.random() * 500) * (i + 1) : 800 * (i + 1);
        console.warn(`Database attempt ${i + 1} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error("Erro crítico na Database (Neon):", errorMessage);
      throw error;
    }
  }
  return [];
}

function prepareForCloud(data: any, type: 'order' | 'driver' | 'store'): any {
  const cloudData = JSON.parse(JSON.stringify(data)); 

  if (type === 'order') {
    if (cloudData.status === OrderStatus.DELIVERED || cloudData.status === OrderStatus.CANCELED) {
      delete cloudData.paymentReceiptUrl;
    }
  } else if (type === 'driver') {
    // REMOÇÃO CRÍTICA: Nunca enviamos o balance de volta para a nuvem via saveDrivers
    // para evitar que o saldo local (desatualizado) sobrescreva o saldo atômico do SQL.
    delete cloudData.balance; 
    
    if (cloudData.status === DriverRegistrationStatus.APPROVED || cloudData.status === DriverRegistrationStatus.REJECTED) {
      delete cloudData.licenseImageUrl;
      delete cloudData.selfieWithLicenseUrl;
      delete cloudData.vehiclePhotoUrl1;
      delete cloudData.vehiclePhotoUrl2;
    }
  } else if (type === 'store') {
    if (cloudData.status === StoreRegistrationStatus.APPROVED) {
      delete cloudData.paymentProofUrl;
    }
  }
  return cloudData;
}

const idb = {
  dbName: 'jaa_delivery_local_db',
  version: 1,
  storeName: 'jaa_data_store',

  getDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const db = await this.getDb();
      return new Promise((resolve) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result !== undefined ? request.result : fallback);
        request.onerror = () => resolve(fallback);
      });
    } catch (e) { return fallback; }
  },

  async set(key: string, data: any): Promise<void> {
    try {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(data, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) { console.error('IDB Error:', e); }
  }
};

export const dbService = {
  isCloudActive: () => !!databaseUrl,

  init: async () => {
    if (!databaseUrl || (window as any)._jaa_db_initialized) return;
    try {
      await executeSql(`CREATE TABLE IF NOT EXISTS settings (id INT PRIMARY KEY, data JSONB NOT NULL);`);
      await executeSql(`CREATE TABLE IF NOT EXISTS drivers (id TEXT PRIMARY KEY, data JSONB NOT NULL);`);
      await executeSql(`CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, data JSONB NOT NULL);`);
      await executeSql(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data JSONB NOT NULL, timestamp BIGINT NOT NULL);`);
      await executeSql(`CREATE TABLE IF NOT EXISTS recharges (id TEXT PRIMARY KEY, data JSONB NOT NULL);`);
      await executeSql(`CREATE TABLE IF NOT EXISTS withdrawals (id TEXT PRIMARY KEY, data JSONB NOT NULL);`);
      
      const settings = await executeSql(`SELECT * FROM settings WHERE id = 1`);
      if (settings.length === 0) {
        await executeSql(`INSERT INTO settings (id, data) VALUES (1, $1)`, [DEFAULT_SETTINGS]);
      }
      (window as any)._jaa_db_initialized = true;
    } catch (e) {
      console.warn("Jaa DB: Erro no Init da nuvem.");
    }
  },

  getSettings: async () => {
    const local = await idb.get('settings', DEFAULT_SETTINGS);
    try {
      const res = await executeSql(`SELECT data FROM settings WHERE id = 1`);
      if (res[0]?.data) {
        await idb.set('settings', res[0].data);
        return res[0].data;
      }
    } catch (e) {}
    return local;
  },

  saveSettings: async (data: PlatformSettings) => {
    await idb.set('settings', data);
    try { await executeSql(`UPDATE settings SET data = $1 WHERE id = 1`, [data]); } catch(e) {}
    syncChannel.postMessage({ type: 'UPDATE_SETTINGS' });
  },

  getDrivers: async () => {
    const local = await idb.get('drivers', []);
    try {
      const res = await executeSql(`SELECT data FROM drivers`);
      const cloud = res.map(r => r.data);
      await idb.set('drivers', cloud);
      return cloud;
    } catch (e) { return local; }
  },

  saveDrivers: async (drivers: DriverProfile[]) => {
    await idb.set('drivers', drivers);
    try {
      if (drivers.length > 0) {
        // ORDENAÇÃO CRÍTICA: Ordenar por ID para evitar deadlocks em updates concorrentes
        const sortedDrivers = [...drivers].sort((a, b) => a.id.localeCompare(b.id));
        
        let query = 'INSERT INTO drivers (id, data) VALUES ';
        const params: any[] = [];
        sortedDrivers.forEach((d, i) => {
          const cloudPayload = prepareForCloud(d, 'driver');
          query += `($${i * 2 + 1}, $${i * 2 + 2})${i === sortedDrivers.length - 1 ? '' : ', '}`;
          params.push(d.id, cloudPayload);
        });
        query += ' ON CONFLICT (id) DO UPDATE SET data = drivers.data || EXCLUDED.data';
        await executeSql(query, params);
      }
    } catch(e) {
      console.error("Erro no batch sync de drivers:", e);
      throw e;
    }
    syncChannel.postMessage({ type: 'UPDATE_DRIVERS' });
  },

  updateDriverDeviceCode: async (driverId: string, token: string) => {
    try {
      // Atualiza a coluna expo_token e status (se existirem) na tabela drivers
      await executeSql(`UPDATE drivers SET expo_token = $1, status = 'Ativo' WHERE id = $2`, [token, driverId]);
    } catch (e) {
      console.warn("Colunas expo_token ou status podem não existir na tabela drivers, ignorando erro.");
    }

    try {
      // Tenta atualizar na tabela motoboys caso ela exista separadamente no Neon
      await executeSql(`UPDATE motoboys SET expo_token = $1, status = 'Ativo' WHERE id = $2`, [token, driverId]);
    } catch (e) {
      console.warn("Tabela motoboys pode não existir, ignorando erro.");
    }
    
    // Atualiza também dentro do JSONB para garantir a consistência do app
    try {
      await executeSql(`
        UPDATE drivers 
        SET data = jsonb_set(data, '{expoPushToken}', $1::jsonb) 
        WHERE id = $2
      `, [JSON.stringify(token), driverId]);
    } catch (e) {
      console.error("Erro ao atualizar data JSONB:", e);
    }
    syncChannel.postMessage({ type: 'UPDATE_DRIVERS' });
  },

  adjustDriverBalance: async (driverId: string, amount: number) => {
    if (amount === 0) return true;
    try {
      const query = `
        UPDATE drivers 
        SET data = jsonb_set(
          data, 
          '{balance}', 
          ((COALESCE(data->>'balance', '0')::numeric + $1)::text)::jsonb
        ) 
        WHERE id = $2
      `;
      await executeSql(query, [amount, driverId]);
      syncChannel.postMessage({ type: 'UPDATE_DRIVERS' });
      return true;
    } catch (e) {
      console.error("Erro fatal ao ajustar saldo via SQL:", e);
      return false;
    }
  },

  deleteDriver: async (driverId: string) => {
    try {
      await executeSql(`DELETE FROM drivers WHERE id = $1`, [driverId]);
    } catch (e) {
      console.error("Cloud DB Error: Failed to delete driver", e);
    }
  },

  getStores: async () => {
    const local = await idb.get('stores', []);
    try {
      const res = await executeSql(`SELECT data FROM stores`);
      const cloud = res.map(r => r.data);
      await idb.set('stores', cloud);
      return cloud;
    } catch (e) { return local; }
  },

  saveStores: async (stores: StoreProfile[]) => {
    await idb.set('stores', stores);
    try {
      if (stores.length > 0) {
        // ORDENAÇÃO CRÍTICA: Ordenar por ID para evitar deadlocks
        const sortedStores = [...stores].sort((a, b) => a.id.localeCompare(b.id));
        
        let query = 'INSERT INTO stores (id, data) VALUES ';
        const params: any[] = [];
        sortedStores.forEach((s, i) => {
          const cloudPayload = prepareForCloud(s, 'store');
          query += `($${i * 2 + 1}, $${i * 2 + 2})${i === sortedStores.length - 1 ? '' : ', '}`;
          params.push(s.id, cloudPayload);
        });
        query += ' ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data';
        await executeSql(query, params);
      }
    } catch(e) {
      console.error("Erro no batch sync de lojas:", e);
      throw e;
    }
    syncChannel.postMessage({ type: 'UPDATE_STORES' });
  },

  deleteStore: async (storeId: string) => {
    try {
      await executeSql(`DELETE FROM stores WHERE id = $1`, [storeId]);
    } catch (e) {
      console.error("Cloud DB Error: Failed to delete store", e);
    }
  },

  getOrders: async () => {
    const local = await idb.get('orders', []);
    try {
      const res = await executeSql(`SELECT data FROM orders ORDER BY timestamp DESC LIMIT 100`);
      const cloud = res.map(r => r.data);
      await idb.set('orders', cloud);
      return cloud.sort((a,b) => b.timestamp - a.timestamp);
    } catch (e) { return local; }
  },

  saveOrders: async (orders: Order[]) => {
    await idb.set('orders', orders);
    
    // Sincronização em lote para a nuvem (muito mais rápido que loop individual)
    try {
      const recentOrders = orders.sort((a,b) => b.timestamp - a.timestamp).slice(0, 20); // Sincroniza apenas os 20 mais recentes para performance
      if (recentOrders.length > 0) {
        // ORDENAÇÃO CRÍTICA: Ordenar por ID para evitar deadlocks
        const sortedOrders = [...recentOrders].sort((a, b) => a.id.localeCompare(b.id));
        
        // Construção de query em lote (Batch Insert)
        let query = 'INSERT INTO orders (id, data, timestamp) VALUES ';
        const params: any[] = [];
        sortedOrders.forEach((o, i) => {
          const cloudPayload = prepareForCloud(o, 'order');
          query += `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})${i === sortedOrders.length - 1 ? '' : ', '}`;
          params.push(o.id, cloudPayload, o.timestamp);
        });
        query += ' ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, timestamp = EXCLUDED.timestamp';
        await executeSql(query, params);
      }
    } catch (e) {
      console.error("Erro no batch sync de pedidos:", e);
      throw e; // Propaga o erro para que a UI possa reagir
    }
    
    syncChannel.postMessage({ type: 'UPDATE_ORDERS' });
  },

  updateOrders: async (ordersToUpdate: Order[]) => {
    try {
      // Ordenar para evitar deadlocks se múltiplos updates ocorrerem simultaneamente
      const sorted = [...ordersToUpdate].sort((a, b) => a.id.localeCompare(b.id));
      for (const o of sorted) {
        const cloudPayload = prepareForCloud(o, 'order');
        await executeSql(`
          INSERT INTO orders (id, data, timestamp) VALUES ($1, $2, $3) 
          ON CONFLICT (id) DO UPDATE SET data = $2, timestamp = $3
        `, [o.id, cloudPayload, o.timestamp]);
      }
    } catch(e) {
      console.error("Erro ao atualizar pedidos na nuvem:", e);
      throw e; // Propaga o erro para que a UI possa reagir
    }
    syncChannel.postMessage({ type: 'UPDATE_ORDERS' });
  },

  clearAllOrders: async () => {
    await idb.set('orders', []);
    try {
      await executeSql(`DELETE FROM orders`);
    } catch (e) {
      console.error("Falha ao limpar os pedidos no banco de dados na nuvem:", e);
    }
    syncChannel.postMessage({ type: 'UPDATE_ORDERS' });
  },

  clearAllRecharges: async () => {
    await idb.set('recharges', []);
    try {
      await executeSql(`DELETE FROM recharges`);
    } catch (e) {
      console.error("Falha ao limpar as recargas no banco de dados na nuvem:", e);
    }
    syncChannel.postMessage({ type: 'UPDATE_RECHARGES' });
  },

  clearAllWithdrawals: async () => {
    await idb.set('withdrawals', []);
    try {
      await executeSql(`DELETE FROM withdrawals`);
    } catch (e) {
      console.error("Falha ao limpar os saques no banco de dados na nuvem:", e);
    }
    syncChannel.postMessage({ type: 'UPDATE_WITHDRAWALS' });
  },

  getRecharges: async (): Promise<RechargeRequest[]> => {
    const local = await idb.get<RechargeRequest[]>('recharges', []);
    try {
      const res = await executeSql(`SELECT data FROM recharges`);
      const cloudData = res.map(r => r.data as RechargeRequest);
      await idb.set('recharges', cloudData);
      return cloudData.sort((a, b) => b.requestDate - a.requestDate);
    } catch (e) { return local; }
  },
  saveRecharges: async (data: RechargeRequest[]) => {
    await idb.set('recharges', data);
    try {
      const sorted = [...data].sort((a, b) => a.id.localeCompare(b.id));
      for (const r of sorted) {
        await executeSql(`INSERT INTO recharges (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [r.id, r]);
      }
    } catch(e) {}
    syncChannel.postMessage({ type: 'UPDATE_RECHARGES' });
  },

  getWithdrawals: async (): Promise<WithdrawalRequest[]> => {
    const local = await idb.get<WithdrawalRequest[]>('withdrawals', []);
    try {
      const res = await executeSql(`SELECT data FROM withdrawals`);
      const cloudData = res.map(r => r.data as WithdrawalRequest);
      await idb.set('withdrawals', cloudData);
      return cloudData.sort((a, b) => b.requestDate - a.requestDate);
    } catch (e) { return local; }
  },
  saveWithdrawals: async (data: WithdrawalRequest[]) => {
    await idb.set('withdrawals', data);
    try {
      const sorted = [...data].sort((a, b) => a.id.localeCompare(b.id));
      for (const w of sorted) {
        await executeSql(`INSERT INTO withdrawals (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [w.id, w]);
      }
    } catch(e) {}
    syncChannel.postMessage({ type: 'UPDATE_WITHDRAWALS' });
  },

  subscribe: (callback: (type: string) => void) => {
    const handler = (event: MessageEvent) => callback(event.data.type);
    syncChannel.addEventListener('message', handler);
    return () => syncChannel.removeEventListener('message', handler);
  }
};