import { FinancingProvider, Installment } from '../types';

export const formatCurrency = (amount: number, currency: 'USD' | 'VES') => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency === 'VES' ? 'VES' : 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

export const calculateInstallments = (
  totalUSD: number,
  provider: FinancingProvider,
  exchangeRate: number
): { initial: number; installments: Installment[] } => {
  if (provider === FinancingProvider.NONE) {
    return { initial: totalUSD, installments: [] };
  }

  // Logic: Initial payment + 6 installments
  // Assuming a standard model where initial is roughly 40-60% depending on provider
  // For this generic implementation, let's assume 50% initial, rest in 6 payments
  
  let initialPercentage = 0.50; 
  
  // Custom rules per provider (simulated)
  if (provider === FinancingProvider.CASHEA) initialPercentage = 0.50; 
  if (provider === FinancingProvider.ZONA_NARANJA) initialPercentage = 0.40;
  if (provider === FinancingProvider.WEPA) initialPercentage = 0.30;
  if (provider === FinancingProvider.CHOLLO) initialPercentage = 0.45;

  const initialAmount = totalUSD * initialPercentage;
  const financedAmount = totalUSD - initialAmount;
  const installmentAmountUSD = financedAmount / 6;

  const installments: Installment[] = [];
  let currentDate = new Date();
  
  for (let i = 1; i <= 6; i++) {
    const nextDate = getNextPaymentDate(currentDate);
    installments.push({
      number: i,
      date: nextDate.toLocaleDateString('es-VE'),
      amountUSD: installmentAmountUSD,
      amountBs: installmentAmountUSD * exchangeRate
    });
    currentDate = nextDate;
  }

  return {
    initial: initialAmount,
    installments
  };
};

// Helper to find next 15th or 30th
const getNextPaymentDate = (fromDate: Date): Date => {
  const d = new Date(fromDate);
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();

  if (day < 15) {
    return new Date(year, month, 15);
  } else if (day < 30) {
    // Determine last day of current month (28, 29, 30, 31)
    // If it's February, "30th" might need to be 28/29. 
    // Simplified: Using 30 or last day of month.
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(30, lastDay));
  } else {
    // Next month 15th
    return new Date(year, month + 1, 15);
  }
};