// data/monitor-mock.ts

export interface MonitorPoint {
  time: string;
  deviation: number;      // Độ lệch %
  threshold: number;      // Ngưỡng kích hoạt (ví dụ 3%)
  isRebalanced: boolean;  // True nếu tại thời điểm này Bot đã chạy
  gasSaved?: number;      // Phí gas tiết kiệm được nhờ Hydra (để hiển thị tooltip)
}

// Kịch bản 1: Volatile Day (Biến động mạnh, Hydra phải can thiệp 2 lần)
export const mockVolatileBasketData: MonitorPoint[] = [
  { time: "08:00", deviation: 0.5, threshold: 3, isRebalanced: false },
  { time: "09:00", deviation: 1.2, threshold: 3, isRebalanced: false },
  { time: "10:00", deviation: 1.8, threshold: 3, isRebalanced: false },
  { time: "11:00", deviation: 2.9, threshold: 3, isRebalanced: false },
  { time: "11:30", deviation: 3.5, threshold: 3, isRebalanced: true, gasSaved: 1.2 }, // Kích hoạt lần 1
  { time: "12:00", deviation: 0.2, threshold: 3, isRebalanced: false }, // Sau khi rebalance về gần 0
  { time: "13:00", deviation: 0.8, threshold: 3, isRebalanced: false },
  { time: "14:00", deviation: 1.5, threshold: 3, isRebalanced: false },
  { time: "15:00", deviation: 2.8, threshold: 3, isRebalanced: false },
  { time: "15:45", deviation: 4.2, threshold: 3, isRebalanced: true, gasSaved: 1.5 }, // Kích hoạt lần 2
  { time: "16:00", deviation: 0.4, threshold: 3, isRebalanced: false },
  { time: "17:00", deviation: 0.9, threshold: 3, isRebalanced: false },
  { time: "18:00", deviation: 1.1, threshold: 3, isRebalanced: false },
];

// Kịch bản 2: Stable Day (Thị trường đi ngang, không cần rebalance)
export const mockStableBasketData: MonitorPoint[] = [
  { time: "08:00", deviation: 0.2, threshold: 3, isRebalanced: false },
  { time: "10:00", deviation: 0.5, threshold: 3, isRebalanced: false },
  { time: "12:00", deviation: 0.4, threshold: 3, isRebalanced: false },
  { time: "14:00", deviation: 0.7, threshold: 3, isRebalanced: false },
  { time: "16:00", deviation: 0.6, threshold: 3, isRebalanced: false },
  { time: "18:00", deviation: 0.3, threshold: 3, isRebalanced: false },
];