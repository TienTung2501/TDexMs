/**
 * Use Case: Get Quote
 * Calculates optimal swap route and expected output.
 */
import { v4 as uuid } from 'uuid';
import { FEE_DENOMINATOR, DEFAULT_SLIPPAGE_BPS } from '@solvernet/shared';
import { Pool } from '../../domain/entities/Pool.js';
import type { IPoolRepository } from '../../domain/ports/IPoolRepository.js';
import { InvalidSwapParamsError, InsufficientLiquidityError } from '../../domain/errors/index.js';
import { AssetId } from '../../domain/value-objects/Asset.js';

export interface GetQuoteInput {
  inputAsset: string;
  outputAsset: string;
  inputAmount?: string;
  outputAmount?: string;
  slippage?: number;
}

export interface GetQuoteOutput {
  quoteId: string;
  inputAsset: string;
  outputAsset: string;
  inputAmount: string;
  outputAmount: string;
  minOutput: string;
  priceImpact: number;
  route: Array<{
    poolId: string;
    type: 'direct' | 'multi-hop';
    inputAsset: string;
    outputAsset: string;
    inputAmount: string;
    outputAmount: string;
    fee: string;
  }>;
  estimatedFees: {
    protocolFee: string;
    networkFee: string;
    solverFee: string;
  };
  expiresAt: string;
}

export class GetQuote {
  constructor(private readonly poolRepo: IPoolRepository) {}

  async execute(input: GetQuoteInput): Promise<GetQuoteOutput> {
    if (!input.inputAmount && !input.outputAmount) {
      throw new InvalidSwapParamsError('Either inputAmount or outputAmount is required');
    }

    if (input.inputAsset === input.outputAsset) {
      throw new InvalidSwapParamsError('Input and output assets must be different');
    }

    const inputAsset = AssetId.fromString(input.inputAsset);
    const outputAsset = AssetId.fromString(input.outputAsset);
    const slippage = input.slippage ?? DEFAULT_SLIPPAGE_BPS;

    // Try direct pool first
    const directPool = await this.poolRepo.findByPair(inputAsset.id, outputAsset.id);

    if (directPool) {
      return this.directQuote(directPool, inputAsset, outputAsset, input, slippage);
    }

    // Try multi-hop through ADA
    if (!inputAsset.isAda && !outputAsset.isAda) {
      const adaAsset = AssetId.fromString('lovelace');
      const poolA = await this.poolRepo.findByPair(inputAsset.id, adaAsset.id);
      const poolB = await this.poolRepo.findByPair(adaAsset.id, outputAsset.id);

      if (poolA && poolB) {
        return this.multiHopQuote(poolA, poolB, inputAsset, outputAsset, input, slippage);
      }
    }

    throw new InsufficientLiquidityError('0', input.inputAmount ?? input.outputAmount ?? '0');
  }

  private directQuote(
    pool: Pool,
    inputAsset: AssetId,
    outputAsset: AssetId,
    input: GetQuoteInput,
    slippage: number,
  ): GetQuoteOutput {
    const aToB = this.isAToB(pool, inputAsset);
    const inputAmount = BigInt(input.inputAmount ?? '0');

    const outputAmount = pool.calculateSwapOutput(inputAmount, aToB);
    if (outputAmount <= 0n) {
      throw new InsufficientLiquidityError(
        (aToB ? pool.reserveB : pool.reserveA).toString(),
        inputAmount.toString(),
      );
    }

    const priceImpact = pool.calculatePriceImpact(inputAmount, aToB);
    const minOutput = outputAmount - (outputAmount * BigInt(slippage)) / BigInt(FEE_DENOMINATOR);
    const fee = (inputAmount * BigInt(pool.feeNumerator)) / BigInt(FEE_DENOMINATOR);

    const quoteId = `qt_${uuid().replace(/-/g, '').slice(0, 12)}`;

    return {
      quoteId,
      inputAsset: inputAsset.id,
      outputAsset: outputAsset.id,
      inputAmount: inputAmount.toString(),
      outputAmount: outputAmount.toString(),
      minOutput: minOutput.toString(),
      priceImpact,
      route: [{
        poolId: pool.id,
        type: 'direct',
        inputAsset: inputAsset.id,
        outputAsset: outputAsset.id,
        inputAmount: inputAmount.toString(),
        outputAmount: outputAmount.toString(),
        fee: fee.toString(),
      }],
      estimatedFees: {
        protocolFee: (fee / 6n).toString(),
        networkFee: '250000', // ~0.25 ADA estimate
        solverFee: '100000',  // ~0.1 ADA estimate
      },
      expiresAt: new Date(Date.now() + 30_000).toISOString(), // 30 sec validity
    };
  }

  private multiHopQuote(
    poolA: Pool,
    poolB: Pool,
    inputAsset: AssetId,
    outputAsset: AssetId,
    input: GetQuoteInput,
    slippage: number,
  ): GetQuoteOutput {
    const _inputAmount = BigInt(input.inputAmount ?? '0');

    // Hop 1: input → ADA
    const aToBFirst = this.isAToB(poolA, inputAsset);
    const adaAmount = poolA.calculateSwapOutput(_inputAmount, aToBFirst);
    const feeA = (_inputAmount * BigInt(poolA.feeNumerator)) / BigInt(FEE_DENOMINATOR);

    // Hop 2: ADA → output
    const adaAsset = AssetId.fromString('lovelace');
    const aToBSecond = this.isAToB(poolB, adaAsset);
    const outputAmount = poolB.calculateSwapOutput(adaAmount, aToBSecond);
    const feeB = (adaAmount * BigInt(poolB.feeNumerator)) / BigInt(FEE_DENOMINATOR);

    if (outputAmount <= 0n) {
      throw new InsufficientLiquidityError('0', _inputAmount.toString());
    }

    const minOutput = outputAmount - (outputAmount * BigInt(slippage)) / BigInt(FEE_DENOMINATOR);
    const totalFee = feeA + feeB;
    const impact1 = poolA.calculatePriceImpact(_inputAmount, aToBFirst);
    const impact2 = poolB.calculatePriceImpact(adaAmount, aToBSecond);

    const quoteId = `qt_${uuid().replace(/-/g, '').slice(0, 12)}`;

    return {
      quoteId,
      inputAsset: inputAsset.id,
      outputAsset: outputAsset.id,
      inputAmount: _inputAmount.toString(),
      outputAmount: outputAmount.toString(),
      minOutput: minOutput.toString(),
      priceImpact: impact1 + impact2,
      route: [
        {
          poolId: poolA.id,
          type: 'multi-hop',
          inputAsset: inputAsset.id,
          outputAsset: 'lovelace',
          inputAmount: _inputAmount.toString(),
          outputAmount: adaAmount.toString(),
          fee: feeA.toString(),
        },
        {
          poolId: poolB.id,
          type: 'multi-hop',
          inputAsset: 'lovelace',
          outputAsset: outputAsset.id,
          inputAmount: adaAmount.toString(),
          outputAmount: outputAmount.toString(),
          fee: feeB.toString(),
        },
      ],
      estimatedFees: {
        protocolFee: (totalFee / 6n).toString(),
        networkFee: '350000', // slightly higher for multi-hop
        solverFee: '150000',
      },
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
  }

  private isAToB(pool: Pool, inputAsset: AssetId): boolean {
    return pool.assetAPolicyId === inputAsset.policyId && pool.assetAAssetName === inputAsset.assetName;
  }
}
