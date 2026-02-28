import { subDays, format, addDays } from 'date-fns';

export interface PricePoint {
  date: string;
  timestamp: number;
  value: number;      // Giá trị NAV của rổ
  adaValue: number;   // Giá ADA để so sánh
  btcValue: number;   // Giá BTC để so sánh
}

export const generateMarketData = (days: number = 365): PricePoint[] => {
  const data: PricePoint[] = [];
  const now = new Date();
  const startDate = subDays(now, days);

  let currentNav = 100;
  let currentAda = 100; // Chuẩn hóa về 100 để so sánh %
  let currentBtc = 100;

  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    
    // Random Walk Logic
    currentNav = currentNav * (1 + (Math.random() - 0.45) * 0.04); // Trend tăng nhẹ
    currentAda = currentAda * (1 + (Math.random() - 0.5) * 0.05);  // Volatile hơn
    currentBtc = currentBtc * (1 + (Math.random() - 0.48) * 0.03);

    data.push({
      date: date.toISOString(),
      timestamp: date.getTime(),
      value: parseFloat(currentNav.toFixed(2)),
      adaValue: parseFloat(currentAda.toFixed(2)),
      btcValue: parseFloat(currentBtc.toFixed(2)),
    });
  }
  return data;
};

export const mockAllocationData = [
  { name: 'SingularityNET', symbol: 'AGIX', value: 45, color: '#8b5cf6' },
  { name: 'Iagon', symbol: 'IAG', value: 30, color: '#ec4899' },
  { name: 'Minswap', symbol: 'MIN', value: 15, color: '#3b82f6' },
  { name: 'DJED', symbol: 'DJED', value: 10, color: '#10b981' },
];
