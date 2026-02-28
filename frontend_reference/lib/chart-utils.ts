// lib/chart-utils.ts

export function generateCandleData(numberOfCandles: number = 200, timeframe: string = '1h') {
  // Xác định khoảng cách thời gian (giây) dựa trên timeframe
  let interval = 3600; // Default 1h
  if (timeframe === '1m') interval = 60;
  if (timeframe === '5m') interval = 300;
  if (timeframe === '4h') interval = 3600 * 4;
  if (timeframe === '1d') interval = 86400;

  // Tính thời gian bắt đầu từ quá khứ
  let time = Math.floor(Date.now() / 1000) - numberOfCandles * interval;
  
  // Giá ngẫu nhiên khác nhau cho mỗi timeframe để nhìn thấy sự thay đổi
  let value = timeframe === '1d' ? 100 : timeframe === '4h' ? 80 : 50; 
  
  const data = [];

  for (let i = 0; i < numberOfCandles; i++) {
    const isUp = Math.random() > 0.5;
    // Volatility (biên độ dao động) cũng nên khác nhau
    const volatility = timeframe === '1d' ? 5 : 0.5; 
    
    const change = Math.random() * volatility;
    const open = value;
    const close = isUp ? value + change : value - change;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;
    
    const volume = Math.floor(Math.random() * 100000) + 1000;
    const color = close >= open ? '#22c55e' : '#ef4444';

    data.push({
      time: time as any,
      open, high, low, close,
      volume, color
    });

    value = close;
    time += interval; // Cộng dồn thời gian theo đúng interval
  }
  return data;
}