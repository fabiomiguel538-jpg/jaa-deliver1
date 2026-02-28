
import React from 'react';
import { UserRole, OrderStatus } from './types';

export const BASE_PRICE = 5.0;
export const KM_PRICE = 1.5;
export const MINUTE_PRICE = 0.5;

// Novo Logotipo PedeJá (Pin com chamas - Identidade Visual de Velocidade)
export const APP_LOGO = "https://i.postimg.cc/P5tM32f8/pedeja-logo.png"; 
export const LOGO_SVG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23F84F39'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-weight='black' font-size='40' fill='white'%3EPJ%3C/text%3E%3C/svg%3E";
export const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export const MOCK_STORES = [
  { id: 's1', name: 'Pizza Place', location: { lat: -23.5505, lng: -46.6333, address: 'Rua Principal, 100' } },
  { id: 's2', name: 'Burger King', location: { lat: -23.5555, lng: -46.6388, address: 'Av. Paulista, 1000' } }
];

export const MOCK_DRIVERS = [
  { id: 'd1', name: 'Carlos Santos', rating: 4.9, plate: 'ABC-1234', location: { lat: -23.5510, lng: -46.6340 } },
  { id: 'd2', name: 'Marcos Lima', rating: 4.7, plate: 'XYZ-9876', location: { lat: -23.5560, lng: -46.6395 } }
];
