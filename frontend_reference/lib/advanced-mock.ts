import { addMinutes, addHours, addDays, format, subHours, subDays } from 'date-fns';

export type TimeFrame = '1H' | '4H' | '1D' | '1W' | '1M';

export interface MonitorPoint {
  time: string;         // ISO string
  timestamp: number;    // Unix timestamp cho XAxis scale
  deviation: number;    // Độ lệch %
  threshold: number;    // Ngưỡng (3%)
  isRebalanced: boolean;
  gasSaved?: number;
  price?: number;       // Giá trị rổ (để vẽ line phụ nếu cần)
}

// Hàm sinh dữ liệu giả lập theo khung thời gian
export const generateTimeframeData = (
  timeframe: TimeFrame, 
  isVolatile: boolean = false
): MonitorPoint[] => {
  let points = [];
  let now = new Date();
  let startTime: Date;
  let intervalMinutes: number;
  let count: number;

  // Cấu hình độ phân giải dữ liệu
  switch (timeframe) {
    case '1H':
      startTime = subHours(now, 1);
      intervalMinutes = 2; // 2 phút 1 điểm
      count = 30;
      break;
    case '4H':
      startTime = subHours(now, 4);
      intervalMinutes = 5; // 5 phút 1 điểm
      count = 48;
      break;
    case '1D':
      startTime = subDays(now, 1);
      intervalMinutes = 30; // 30 phút 1 điểm
      count = 48;
      break;
    case '1W':
      startTime = subDays(now, 7);
      intervalMinutes = 240; // 4 tiếng 1 điểm
      count = 42;
      break;
    case '1M':
      startTime = subDays(now, 30);
      intervalMinutes = 720; // 12 tiếng 1 điểm
      count = 60;
      break;
    default:
      startTime = subHours(now, 1);
      intervalMinutes = 5;
      count = 12;
  }

  let currentDeviation = 0.5;
  const threshold = 3.0;

  for (let i = 0; i < count; i++) {
    const time = addMinutes(startTime, i * intervalMinutes);
    
    // Logic Random Walk để tạo biểu đồ giống thật
    // Nếu volatile (biến động) thì bước nhảy lớn hơn
    const change = (Math.random() - 0.5) * (isVolatile ? 0.8 : 0.3); 
    currentDeviation += change;

    // Không để deviation âm
    if (currentDeviation < 0) currentDeviation = Math.abs(currentDeviation);

    // Mô phỏng Rebalance: Nếu vượt ngưỡng, có 80% cơ hội Bot sẽ chạy và kéo deviation về 0
    let isRebalanced = false;
    let gasSaved = 0;

    if (currentDeviation > threshold && Math.random() > 0.2) {
      isRebalanced = true;
      currentDeviation = 0.1 + Math.random() * 0.2; // Reset về gần 0
      gasSaved = 1.5 + Math.random();
    }

    points.push({
      time: time.toISOString(),
      timestamp: time.getTime(),
      deviation: parseFloat(currentDeviation.toFixed(2)),
      threshold: threshold,
      isRebalanced,
      gasSaved: isRebalanced ? parseFloat(gasSaved.toFixed(2)) : undefined
    });
  }

  return points;
};