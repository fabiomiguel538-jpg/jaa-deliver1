
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
  SCHEDULED = 'SCHEDULED',
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
  storeCity: string; 
  driverId?: string;
  preAssignedDriverId?: string; 
  linkedToOrderId?: string;
  status: OrderStatus;
  pickup: Location;
  dropoff: Location;
  price: number; 
  driverEarning: number; 
  distance: number;
  timestamp: number;
  scheduledTime?: number;
  deliveryCode: string;
  requiresDeliveryCode?: boolean;
  paymentReceiptUrl?: string;
  hasReturnFee?: boolean;
  returnFeePrice?: number;
  returnFeePaid?: boolean;
  driverReportedReturn?: boolean; // Novo campo
  collectionAmount?: number;
  paymentMethodAtDelivery?: 'CASH' | 'CARD_MACHINE' | 'NONE';
  dropoffComplement?: string;
  customerPhone?: string;
}

export interface DriverProfile {
  id: string;
  name: string;
  email: string;
  taxId: string;
  phone?: string;
  whatsapp?: string;
  password?: string;
  vehicle: string;
  plate: string;
  city: string;
  cep: string;
  licenseImageUrl?: string;
  selfieWithLicenseUrl?: string; 
  vehiclePhotoUrl1?: string;    
  vehiclePhotoUrl2?: string;    
  status: DriverRegistrationStatus;
  registrationDate: string;
  balance: number;
  isOnline?: boolean;
  currentLocation?: Location;
  fcmToken?: string;
  pixKey?: string;
  isBlocked?: boolean;
  blockReason?: string;
}

export interface StoreProfile {
  id: string;
  name: string;
  email: string;
  taxId: string;
  phone?: string;
  whatsapp?: string;
  password?: string;
  cep: string;
  city: string;
  address: string;
  number?: string;
  location: Location;
  status: StoreRegistrationStatus;
  registrationDate: string;
  balance: number;
  deliveryRadius: number;
  accessValidity?: number; 
  accessRequestType?: 'DAILY' | 'MONTHLY'; 
  paymentProofUrl?: string; 
  isBlocked?: boolean;
  blockReason?: string;
  // Precificação Individual
  minPrice?: number;
  pricePerKm?: number;
  kmFranchise?: number;
  returnFeeAmount?: number;
  driverEarningModel?: 'PERCENTAGE' | 'FIXED';
  driverEarningPercentage?: number;
  driverEarningFixed?: number;
}

export interface RechargeRequest {
  id: string;
  storeId: string;
  storeName: string;
  amount: number;
  status: RechargeRequestStatus;
  requestDate: number;
  paymentReceiptUrl?: string;
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
  supportWhatsapp?: string;
  minPrice: number;
  pricePerKm: number;
  kmFranchise: number;
  minimumWithdrawalAmount: number;
  driverEarningModel: 'PERCENTAGE' | 'FIXED';
  driverEarningPercentage: number;
  driverEarningFixed: number;
  returnFeeAmount: number; 
}
