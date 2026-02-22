/**
 * Use Case: Update Protocol Settings (Domain layer wrapper)
 *
 * Gap G4 / audit R-14: Provides a proper domain use-case instead of routes
 * calling TxBuilder directly. Adds:
 *   - Admin address validation
 *   - Structured input/output contracts
 *   - Clear error handling
 *
 * Covers both:
 *   - buildUpdateSettingsTx:  updates existing settings UTxO (requires admin sig)
 *   - buildDeploySettingsTx:  deploys the initial settings UTxO on first bootstrap
 */
import type { ITxBuilder, BuildTxResult } from '../../domain/ports/ITxBuilder.js';
import { InvalidSwapParamsError } from '../../domain/errors/index.js';

export interface UpdateSettingsInput {
  /** Admin Cardano address (must match on-chain settings admin VKH) */
  adminAddress: string;
  /** New protocol fee in basis points (1bp = 0.01%) */
  protocolFeeBps: number;
  /** Minimum pool liquidity in lovelace */
  minPoolLiquidity: string;
  /** Version counter (must increment by 1 on update) */
  nextVersion?: number;
  /** Initial deploy only: override fee collector address */
  feeCollectorAddress?: string;
  /** Mode: 'update' uses an existing settings UTxO; 'deploy' creates a new one */
  mode?: 'update' | 'deploy';
}

export interface UpdateSettingsOutput {
  unsignedTx: string;
  txHash: string;
  estimatedFee: string;
  mode: 'update' | 'deploy';
}

export class UpdateSettingsUseCase {
  constructor(private readonly txBuilder: ITxBuilder) {}

  async execute(input: UpdateSettingsInput): Promise<UpdateSettingsOutput> {
    if (!input.adminAddress) {
      throw new InvalidSwapParamsError('adminAddress is required');
    }
    if (input.protocolFeeBps < 0 || input.protocolFeeBps > 10_000) {
      throw new InvalidSwapParamsError(
        'protocolFeeBps must be between 0 and 10000 (0%–100%)',
      );
    }

    const minPoolLiquidity = BigInt(input.minPoolLiquidity ?? '0');
    if (minPoolLiquidity < 0n) {
      throw new InvalidSwapParamsError('minPoolLiquidity must be non-negative');
    }

    const mode = input.mode ?? 'update';
    let txResult: BuildTxResult;

    if (mode === 'deploy') {
      // Initial bootstrap: deploy the settings UTxO for the first time
      txResult = await this.txBuilder.buildDeploySettingsTx({
        adminAddress: input.adminAddress,
        protocolFeeBps: input.protocolFeeBps,
        minPoolLiquidity,
        feeCollectorAddress: input.feeCollectorAddress,
      });
    } else {
      // Subsequent update: spend the existing settings UTxO, produce a new one
      txResult = await this.txBuilder.buildUpdateSettingsTx({
        adminAddress: input.adminAddress,
        newSettings: {
          maxProtocolFeeBps: input.protocolFeeBps,
          minPoolLiquidity,
          nextVersion: input.nextVersion ?? 1,
        },
      });
    }

    return {
      unsignedTx: txResult.unsignedTx,
      txHash: txResult.txHash,
      estimatedFee: txResult.estimatedFee.toString(),
      mode,
    };
  }
}
