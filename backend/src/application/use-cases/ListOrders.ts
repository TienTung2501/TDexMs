/**
 * Use Case: List Orders
 */
import type { IOrderRepository, OrderFilters, OrderPage } from '../../domain/ports/IOrderRepository.js';

export class ListOrders {
  constructor(private readonly orderRepo: IOrderRepository) {}

  async execute(filters: OrderFilters): Promise<OrderPage> {
    return this.orderRepo.findMany(filters);
  }
}
