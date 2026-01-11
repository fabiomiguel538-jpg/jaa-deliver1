export enum UserRole {
  STORE = 'STORE',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN'
}

export enum OrderStatus {
  SEARCHING = 'SEARCHING',
  ACCEPTED = 'ACCEPTED',
  PICKUP = 'PICKUP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELED = 'CANCELED',
  PENDING_PAYMENT_CONFIRMATION = 'PENDING_PAYMENT_CONFIRMATION'
}

export enum DriverRegistrationStatus {
  NOT_REGISTERED = 'NOT_REGISTERED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum StoreRegistrationStatus {
  NOT_REGISTERED = 'NOT_REGISTERED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum RechargeRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum WithdrawalRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface Order {
  id: string;
  storeId: string;
  storeCity: string; // Adicionado para facilitar filtragem
  driverId?: string;
  status: OrderStatus;
  pickup: Location;
  dropoff: Location;
  price: number; // Valor pago pela loja
  driverEarning: number; // Valor recebido pelo motoboy
  distance: number;
  timestamp: number;
  deliveryCode: string;
  paymentReceiptUrl?: string;
}

export interface DriverProfile {
  id: string;
  name: string;
  email: string;
  taxId: string;
  password?: string;
  vehicle: string;
  plate: string;
  city: string;
  cep: string;
  licenseImageUrl?: string;
  selfieWithLicenseUrl?: string; // Selfie segurando CNH
  vehiclePhotoUrl1?: string;    // Foto da moto 1
  vehiclePhotoUrl2?: string;    // Foto da moto 2 (placa)
  status: DriverRegistrationStatus;
  registrationDate: string;
  balance: number;
  isOnline?: boolean;
  currentLocation?: Location;
  pixKey?: string;
}

export interface StoreProfile {
  id: string;
  name: string;
  email: string;
  taxId: string;
  password?: string;
  cep: string;
  city: string;
  address: string;
  location: Location;
  status: StoreRegistrationStatus;
  registrationDate: string;
  balance: number;
  deliveryRadius: number;
  accessValidity?: number; // Timestamp de validade do acesso
  accessRequestType?: 'DAILY' | 'MONTHLY'; // Pedido pendente
}

export interface RechargeRequest {
  id: string;
  storeId: string;
  storeName: string;
  amount: number;
  status: RechargeRequestStatus;
  requestDate: number;
}

export interface WithdrawalRequest {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  status: WithdrawalRequestStatus;
  requestDate: number;
  driverPixKey?: string;
}

export interface PlatformSettings {
  dailyPrice: number;
  monthlyPrice: number;
  pixKey: string;
  minPrice: number;
  pricePerKm: number;
  minimumWithdrawalAmount: number;
  driverEarningModel: 'PERCENTAGE' | 'FIXED';
  driverEarningPercentage: number;
  driverEarningFixed: number;
}