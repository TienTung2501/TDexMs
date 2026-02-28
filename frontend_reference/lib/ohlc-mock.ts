import { addMinutes, subDays } from 'date-fns';

export type TimeFrame = '1H' | '4H' | '1D' | '1W';

export interface OHLCPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const generateOHLCData = (
  timeframe: TimeFrame, 
  basePrice: number = 1.0, 
  volatility: number = 0.02
): OHLCPoint[] => {
  let points: OHLCPoint[] = [];
  let now = new Date();
  let startTime: Date;
  let intervalMinutes: number;
  let count: number;

  // Config số lượng nến hiển thị
  switch (timeframe) {
    case '1H': startTime = subDays(now, 2); intervalMinutes = 60; count = 48; break;
    case '4H': startTime = subDays(now, 14); intervalMinutes = 240; count = 84; break;
    case '1D': startTime = subDays(now, 180); intervalMinutes = 1440; count = 180; break;
    case '1W': startTime = subDays(now, 720); intervalMinutes = 10080; count = 104; break;
    default: startTime = subDays(now, 30); intervalMinutes = 1440; count = 30;
  }

  let currentClose = basePrice;

  for (let i = 0; i < count; i++) {
    const time = addMinutes(startTime, i * intervalMinutes);
    const open = currentClose;
    const change = (Math.random() - 0.5) * volatility;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.floor(Math.random() * 50000) + 1000;

    points.push({
      timestamp: time.getTime(),
      open, high, low, close, volume
    });

    currentClose = close;
  }

  return points;
};