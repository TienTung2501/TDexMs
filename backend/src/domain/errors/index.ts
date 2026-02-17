/**
 * Domain-specific errors
 * Each error carries a code for API responses.
 */

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InsufficientLiquidityError extends DomainError {
  constructor(available: string, requested: string) {
    super('INSUFFICIENT_LIQUIDITY', `Not enough liquidity. Available: ${available}, Requested: ${requested}`, {
      availableLiquidity: available,
      requestedAmount: requested,
    });
  }
}

export class IntentExpiredError extends DomainError {
  constructor(intentId: string) {
    super('INTENT_EXPIRED', `Intent ${intentId} has expired`);
  }
}

export class IntentNotFoundError extends DomainError {
  constructor(intentId: string) {
    super('INTENT_NOT_FOUND', `Intent ${intentId} does not exist`);
  }
}

export class PoolNotFoundError extends DomainError {
  constructor(poolId: string) {
    super('POOL_NOT_FOUND', `Pool ${poolId} does not exist`);
  }
}

export class PoolAlreadyExistsError extends DomainError {
  constructor(assetA: string, assetB: string) {
    super('POOL_EXISTS', `A pool for ${assetA}/${assetB} already exists`);
  }
}

export class InvalidSwapParamsError extends DomainError {
  constructor(reason: string) {
    super('INVALID_REQUEST', `Invalid swap parameters: ${reason}`);
  }
}

export class OrderNotFoundError extends DomainError {
  constructor(orderId: string) {
    super('ORDER_NOT_FOUND', `Order ${orderId} does not exist`);
  }
}

export class ChainError extends DomainError {
  constructor(message: string) {
    super('CHAIN_ERROR', message);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message);
  }
}
