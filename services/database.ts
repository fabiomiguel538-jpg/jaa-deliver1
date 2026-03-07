import { neon } from '@neondatabase/serverless';
import { Order, DriverProfile, StoreProfile, RechargeRequest, PlatformSettings, WithdrawalRequest, OrderStatus, DriverRegistrationStatus, StoreRegistrationStatus } from '../types';

const databaseUrl = 'postgresql://neondb_owner:npg_Pynw4DFcu2oz@ep-summer-fire-ahg7bdxc.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

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

async function executeSql(query: string, params: any[] = [], retries = 3): Promise<any[]> {
  if (!databaseUrl) return [];
  
  for (let i = 0; i < retries; i++) {
    try {
      const sql = neon(databaseUrl);
      const result = await sql(query, params);
      return result as any[];
    } catch (error: any) {
      const isNetworkError = error.message.includes('Failed to fetch') || error.message.includes('Load failed');
      if (isNetworkError && i < retries - 1) {
        console.warn(`Database attempt ${i + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        continue;
      }
      console.error("Erro na Database (Neon):", error.message);
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
    if (!databaseUrl) return;
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
      for (const d of drivers) {
        const cloudPayload = prepareForCloud(d, 'driver');
        // Usamos jsonb_set para garantir que se o registro já existir, apenas atualizamos o que foi enviado, 
        // mas mantendo o 'balance' intacto se não estiver no payload (que removemos no prepareForCloud).
        await executeSql(`
          INSERT INTO drivers (id, data) VALUES ($1, $2) 
          ON CONFLICT (id) DO UPDATE SET data = drivers.data || $2
        `, [d.id, cloudPayload]);
      }
    } catch(e) {}
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
      for (const s of stores) {
        const cloudPayload = prepareForCloud(s, 'store');
        await executeSql(`INSERT INTO stores (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [s.id, cloudPayload]);
      }
    } catch(e) {}
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
    try {
      const recentOrders = orders.sort((a,b) => b.timestamp - a.timestamp).slice(0, CLOUD_ORDER_LIMIT);
      for (const o of recentOrders) {
        const cloudPayload = prepareForCloud(o, 'order');
        await executeSql(`INSERT INTO orders (id, data, timestamp) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = $2, timestamp = $3`, [o.id, cloudPayload, o.timestamp]);
      }
    } catch(e) {}
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
      for (const r of data) {
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
      for (const w of data) {
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