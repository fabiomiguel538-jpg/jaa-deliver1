
import React from 'react';
import { UserRole, OrderStatus } from './types';

export const BASE_PRICE = 5.0;
export const KM_PRICE = 1.5;
export const MINUTE_PRICE = 0.5;

export const MOCK_STORES = [
  { id: 's1', name: 'Pizza Place', location: { lat: -23.5505, lng: -46.6333, address: 'Rua Principal, 100' } },
  { id: 's2', name: 'Burger King', location: { lat: -23.5555, lng: -46.6388, address: 'Av. Paulista, 1000' } }
];

export const MOCK_DRIVERS = [
  { id: 'd1', name: 'Carlos Santos', rating: 4.9, plate: 'ABC-1234', location: { lat: -23.5510, lng: -46.6340 } },
  { id: 'd2', name: 'Marcos Lima', rating: 4.7, plate: 'XYZ-9876', location: { lat: -23.5560, lng: -46.6395 } }
];
