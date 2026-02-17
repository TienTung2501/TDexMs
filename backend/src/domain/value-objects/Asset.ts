/**
 * Domain Value Object: Asset
 */
export class AssetId {
  constructor(
    public readonly policyId: string,
    public readonly assetName: string,
  ) {}

  /** Unique string key */
  get id(): string {
    if (this.policyId === '' && this.assetName === '') return 'lovelace';
    return `${this.policyId}.${this.assetName}`;
  }

  /** Whether this is ADA (lovelace) */
  get isAda(): boolean {
    return this.policyId === '' && this.assetName === '';
  }

  /** Parse from string */
  static fromString(id: string): AssetId {
    if (id === 'lovelace') return new AssetId('', '');
    const parts = id.split('.');
    return new AssetId(parts[0] ?? '', parts[1] ?? '');
  }

  /** Canonical pair key (sorted) */
  static pairKey(a: AssetId, b: AssetId): string {
    const aId = a.id;
    const bId = b.id;
    return aId < bId ? `${aId}/${bId}` : `${bId}/${aId}`;
  }

  equals(other: AssetId): boolean {
    return this.policyId === other.policyId && this.assetName === other.assetName;
  }
}
