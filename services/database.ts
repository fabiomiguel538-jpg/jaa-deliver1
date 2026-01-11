
import { neon } from '@neondatabase/serverless';
import { Order, DriverProfile, StoreProfile, RechargeRequest, PlatformSettings, WithdrawalRequest } from '../types';

/**
 * CONFIGURAÇÃO DE MIGRAÇÃO:
 * Se você estiver usando Google Cloud SQL, a DATABASE_URL deve ser a URL 
 * da sua Cloud Function que executa o SQL. 
 */
const databaseUrl = process.env.DATABASE_URL;

// Canal de sincronização entre abas do navegador
const syncChannel = new BroadcastChannel('jaa_delivery_sync');

const DEFAULT_SETTINGS: PlatformSettings = {
  dailyPrice: 10.00,
  monthlyPrice: 180.00,
  pixKey: 'pix@jaadelivery.com',
  minPrice: 7.0,
  pricePerKm: 2.0,
  minimumWithdrawalAmount: 80.0,
  driverEarningModel: 'PERCENTAGE',
  driverEarningPercentage: 85,
  driverEarningFixed: 7.0
};

/**
 * Motor de Execução SQL (Abstração para Migração)
 * Esta função decide se usa o driver do Neon ou uma chamada Fetch para sua Ponte no Google Cloud.
 */
async function executeSql(query: string, params: any[] = []): Promise<any[]> {
  if (!databaseUrl) return [];

  try {
    // Se for uma URL de Ponte (Google Cloud Function)
    if (databaseUrl.startsWith('http')) {
      const response = await fetch(databaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, params }),
      });
      const result = await response.json();
      return result.rows || result;
    } 
    
    // Se for conexão direta via Neon (Fallback/Desenvolvimento)
    const sql = neon(databaseUrl);
    // @ts-ignore - Interpolação dinâmica simplificada para o exemplo
    return await sql(query, ...params);
  } catch (error) {
    console.error("SQL Execution Error:", error);
    throw error;
  }
}

/**
 * Motor de armazenamento IndexedDB (Persistência local robusta)
 * Mantém o app funcionando mesmo se o banco de dados na nuvem cair.
 */
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
    } catch (e) {
      return fallback;
    }
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
    } catch (e) {
      console.error('IDB Set Error:', e);
    }
  }
};

export const dbService = {
  isConnected: () => !!databaseUrl,

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
    } catch (error) {
      console.error("Erro ao inicializar banco de dados:", error);
    }
  },

  getSettings: async (): Promise<PlatformSettings> => {
    if (!databaseUrl) return idb.get('settings', DEFAULT_SETTINGS);
    try {
      const res = await executeSql(`SELECT data FROM settings WHERE id = 1`);
      const data = res[0]?.data || DEFAULT_SETTINGS;
      await idb.set('settings', data);
      return data;
    } catch (e) {
      return idb.get('settings', DEFAULT_SETTINGS);
    }
  },

  saveSettings: async (settings: PlatformSettings) => {
    await idb.set('settings', settings);
    if (databaseUrl) {
      try {
        await executeSql(`UPDATE settings SET data = $1 WHERE id = 1`, [settings]);
      } catch (e) { console.error("Erro ao salvar settings:", e); }
    }
    syncChannel.postMessage({ type: 'UPDATE_SETTINGS' });
  },

  getDrivers: async (): Promise<DriverProfile[]> => {
    if (!databaseUrl) return idb.get('drivers', []);
    try {
      const res = await executeSql(`SELECT data FROM drivers`);
      const drivers = res.map(r => r.data);
      await idb.set('drivers', drivers);
      return drivers;
    } catch (e) { return idb.get('drivers', []); }
  },
  
  saveDrivers: async (drivers: DriverProfile[]) => {
    await idb.set('drivers', drivers);
    if (databaseUrl) {
      try {
        for (const driver of drivers) {
          await executeSql(`INSERT INTO drivers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [driver.id, driver]);
        }
      } catch (e) { console.error("Erro ao salvar drivers:", e); }
    }
    syncChannel.postMessage({ type: 'UPDATE_DRIVERS' });
  },

  getStores: async (): Promise<StoreProfile[]> => {
    if (!databaseUrl) return idb.get('stores', []);
    try {
      const res = await executeSql(`SELECT data FROM stores`);
      const stores = res.map(r => r.data);
      await idb.set('stores', stores);
      return stores;
    } catch (e) { return idb.get('stores', []); }
  },

  saveStores: async (stores: StoreProfile[]) => {
    await idb.set('stores', stores);
    if (databaseUrl) {
      try {
        for (const store of stores) {
          await executeSql(`INSERT INTO stores (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [store.id, store]);
        }
      } catch (e) { console.error("Erro ao salvar lojas:", e); }
    }
    syncChannel.postMessage({ type: 'UPDATE_STORES' });
  },

  getOrders: async (): Promise<Order[]> => {
    if (!databaseUrl) return idb.get('orders', []);
    try {
      const res = await executeSql(`SELECT data FROM orders ORDER BY timestamp DESC LIMIT 100`);
      const orders = res.map(r => r.data);
      await idb.set('orders', orders);
      return orders;
    } catch (e) { return idb.get('orders', []); }
  },

  saveOrders: async (orders: Order[]) => {
    await idb.set('orders', orders);
    if (databaseUrl) {
      try {
        for (const order of orders) {
          await executeSql(`INSERT INTO orders (id, data, timestamp) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = $2, timestamp = $3`, [order.id, order, order.timestamp]);
        }
      } catch (e) { console.error("Erro ao salvar pedidos:", e); }
    }
    syncChannel.postMessage({ type: 'UPDATE_ORDERS' });
  },

  getRecharges: async (): Promise<RechargeRequest[]> => {
    if (!databaseUrl) return idb.get('recharges', []);
    try {
      const res = await executeSql(`SELECT data FROM recharges`);
      const recharges = res.map(r => r.data);
      await idb.set('recharges', recharges);
      return recharges;
    } catch (e) { return idb.get('recharges', []); }
  },

  saveRecharges: async (recharges: RechargeRequest[]) => {
    await idb.set('recharges', recharges);
    if (databaseUrl) {
      try {
        for (const req of recharges) {
          await executeSql(`INSERT INTO recharges (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [req.id, req]);
        }
      } catch (e) { console.error("Erro ao salvar recargas:", e); }
    }
    syncChannel.postMessage({ type: 'UPDATE_RECHARGES' });
  },
  
  getWithdrawals: async (): Promise<WithdrawalRequest[]> => {
    if (!databaseUrl) return idb.get('withdrawals', []);
    try {
      const res = await executeSql(`SELECT data FROM withdrawals`);
      const withdrawals = res.map(r => r.data);
      await idb.set('withdrawals', withdrawals);
      return withdrawals;
    } catch (e) { return idb.get('withdrawals', []); }
  },

  saveWithdrawals: async (withdrawals: WithdrawalRequest[]) => {
    await idb.set('withdrawals', withdrawals);
    if (databaseUrl) {
      try {
        for (const req of withdrawals) {
          await executeSql(`INSERT INTO withdrawals (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`, [req.id, req]);
        }
      } catch (e) { console.error("Erro ao salvar saques:", e); }
    }
    syncChannel.postMessage({ type: 'UPDATE_WITHDRAWALS' });
  },

  subscribe: (callback: (type: string) => void) => {
    const handler = (event: MessageEvent) => callback(event.data.type);
    syncChannel.addEventListener('message', handler);
    return () => syncChannel.removeEventListener('message', handler);
  }
};
