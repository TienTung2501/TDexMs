/**
 * Port: Order Repository Interface
 * Handles persistence for advanced orders (Limit, DCA, StopLoss).
 */
import type { Order } from '../entities/Order.js';
import type { OrderType, OrderStatus } from '../../shared/index.js';

export interface OrderFilters {
  creator?: string;
  status?: OrderStatus;
  type?: OrderType;
  cursor?: string;
  limit?: number;
}

export interface OrderPage {
  items: Order[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface IOrderRepository {
  /** Save a new or updated order */
  save(order: Order): Promise<void>;

  /** Find order by ID */
  findById(id: string): Promise<Order | null>;

  /** List orders with pagination & filters */
  findMany(filters: OrderFilters): Promise<OrderPage>;

  /** Get all active/partially filled orders (for keeper bot) */
  findExecutableOrders(): Promise<Order[]>;

  /** Count orders by status */
  countByStatus(status: OrderStatus): Promise<number>;

  /** Update order status */
  updateStatus(id: string, status: OrderStatus): Promise<void>;

  /** Batch mark expired orders */
  markExpired(currentTimeMs: number): Promise<number>;
}
