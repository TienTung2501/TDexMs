/**
 * Port: Intent Repository Interface
 * Domain layer defines the contract; infrastructure implements it.
 */
import type { Intent } from '../entities/Intent.js';
import type { IntentStatus } from '../../shared/index.js';

export interface IntentFilters {
  address?: string;
  status?: IntentStatus;
  cursor?: string;
  limit?: number;
}

export interface IntentPage {
  items: Intent[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface IIntentRepository {
  /** Save a new or updated intent */
  save(intent: Intent): Promise<void>;

  /** Find intent by ID */
  findById(id: string): Promise<Intent | null>;

  /** Find intent by escrow UTxO reference */
  findByUtxoRef(txHash: string, outputIndex: number): Promise<Intent | null>;

  /** List intents with pagination & filters */
  findMany(filters: IntentFilters): Promise<IntentPage>;

  /** Get all active intents (for solver) */
  findActiveIntents(): Promise<Intent[]>;

  /** Count intents by status */
  countByStatus(status: IntentStatus): Promise<number>;

  /** Update intent status */
  updateStatus(id: string, status: IntentStatus): Promise<void>;

  /** Batch update expired intents */
  markExpired(currentTimeMs: number): Promise<number>;
}
