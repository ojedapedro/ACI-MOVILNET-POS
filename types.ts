export interface Product {
  imei: string;
  name: string;
  priceUSD: number;
  stock: number;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Customer {
  fullName: string;
  cedula: string;
  phone: string;
}

export enum PaymentMethod {
  CASH_USD = 'Efectivo USD',
  CASH_BS = 'Efectivo Bs',
  PAGO_MOVIL = 'Pago Móvil',
  TRANSFERENCIA = 'Transferencia',
  ZELLE = 'Zelle',
  BINANCE = 'Binance'
}

export enum FinancingProvider {
  NONE = 'Contado',
  CASHEA = 'Cashea',
  ZONA_NARANJA = 'Zona Naranja',
  WEPA = 'Wepa',
  CHOLLO = 'Chollo'
}

export interface Installment {
  date: string;
  amountUSD: number;
  amountBs: number;
  number: number;
}

export interface SaleData {
  customer: Customer;
  items: CartItem[];
  exchangeRate: number;
  financing: FinancingProvider;
  installments: Installment[];
  initialPayment: number; // USD
  totalUSD: number;
  observations: string;
  date: string;
}

export interface SaleHistoryItem {
  date: string;
  id: string;
  client: string;
  cedula: string;
  itemsSummary: string;
  totalUSD: number;
  totalBs: number;
  paymentMethod: string;
  financing: string;
  pdfUrl: string;
}

// Add global declaration for Google Apps Script
declare global {
  interface Window {
    google?: {
      script: {
        run: {
          withSuccessHandler: (callback: (data: any) => void) => {
            withFailureHandler: (callback: (error: any) => void) => any;
          };
          [key: string]: any;
        };
      };
    };
  }
}