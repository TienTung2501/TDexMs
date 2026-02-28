# Settings NFT Deploy — Implementation Report

## Tóm tắt

Đã sửa hàm `buildDeploySettingsTx` trong `TxBuilder.ts` để mint một NFT thread token cho Settings UTxO, tương tự cách `buildDeployFactoryTx` đã làm cho Factory UTxO. Trước đây, Settings UTxO được deploy mà KHÔNG có NFT xác thực — bất kỳ ai cũng có thể tạo UTxO giả tại cùng address. Sau thay đổi, Settings UTxO được bảo vệ bởi one-shot NFT mint qua `intent_token_policy`.

---

## 1. Vấn đề (Trước khi sửa)

### `buildDeploySettingsTx` (cũ)
- Chỉ gửi `MIN_SCRIPT_LOVELACE` + `SettingsDatum` đến settings address
- **Không mint NFT** — Settings UTxO không có thread token
- Sử dụng `resolveSettingsScript()` phụ thuộc vào `SETTINGS_NFT_POLICY_ID` env var (chicken-and-egg: env var chưa tồn tại lúc deploy lần đầu)
- Address không parameterized đúng → Frontend hiển thị "Unparameterized" (đỏ)

### `buildDeployFactoryTx` (tham chiếu — đã đúng)
- Mint NFT via `intent_token_policy` sử dụng seed UTxO
- Gửi lovelace + `FactoryDatum` + Factory NFT đến factory address
- NFT token name = `blake2b_256(serialise(OutRef(seedTxHash, seedOutputIndex)))`

---

## 2. Giải pháp (Sau khi sửa)

### `buildDeploySettingsTx` (mới) — 4 bước:

#### Bước 1: Mint Settings NFT via `intent_token_policy`
```typescript
const seedUtxo = adminUtxos[0];
const outRefDatum = Data.to(
  new Constr(0, [seedUtxo.txHash, BigInt(seedUtxo.outputIndex)]),
);
const settingsNftNameHex = datumToHash(outRefDatum);
const settingsNftUnit = toUnit(r.intentPolicyId, settingsNftNameHex);
```
- Lấy UTxO đầu tiên từ admin wallet làm seed
- Tính token name = `blake2b_256` hash của `OutRef(txHash, outputIndex)`
- Policy ID = `intentPolicyId` (đã resolved từ blueprint)

#### Bước 2: Parameterize `settings_validator` với NFT vừa mint
```typescript
const settingsNftAssetClass = mkAssetClass(r.intentPolicyId, settingsNftNameHex);
const appliedCode = applyParamsToScript(settingsBp.compiledCode, [
  Data.to(settingsNftAssetClass),
]);
const settingsScript: Script = {
  type: 'PlutusV3',
  script: applyDoubleCborEncoding(appliedCode),
};
const settingsAddr = validatorToAddress(this.network, settingsScript);
```
- Apply NFT AssetClass = `Constr(0, [policyId, assetName])` làm parameter
- Suy ra canonical address từ parameterized script
- **Không phụ thuộc env var** — tính trực tiếp từ seed UTxO

#### Bước 3: Build SettingsDatum (7 fields, không thay đổi)
```
Constr(0, [adminVkh, protocolFeeBps, minPoolLiquidity, minIntentSize, solverBond, feeCollector, version])
```

#### Bước 4: Build Transaction
```typescript
const tx = lucid.newTx()
  .collectFrom([seedUtxo])                    // Consume seed UTxO (one-shot)
  .mintAssets(
    { [settingsNftUnit]: 1n },
    IntentTokenRedeemer.Mint(seedUtxo.txHash, BigInt(seedUtxo.outputIndex)),
  )
  .attach.MintingPolicy(r.intentPolicyScript) // Attach minting policy
  .pay.ToContract(
    settingsAddr,                              // Parameterized address
    { kind: 'inline', value: settingsDatum },
    { lovelace: MIN_SCRIPT_LOVELACE, [settingsNftUnit]: 1n },
  )
  .addSigner(params.adminAddress);
```

---

## 3. Thay đổi Interface

### `BuildTxResult` — thêm `settingsMeta`
```typescript
// domain/ports/ITxBuilder.ts
settingsMeta?: {
  settingsNftPolicyId: string;
  settingsNftAssetName: string;
};
```

### `UpdateSettingsOutput` — pass-through `settingsMeta`
```typescript
// application/use-cases/UpdateSettingsUseCase.ts
settingsMeta?: {
  settingsNftPolicyId: string;
  settingsNftAssetName: string;
};
```

---

## 4. Files Modified

| File | Changes |
|------|---------|
| `backend/src/infrastructure/cardano/TxBuilder.ts` | Rewrote `buildDeploySettingsTx` — added NFT minting via `intent_token_policy`, parameterized settings_validator with minted NFT, included NFT in output assets, return `settingsMeta` |
| `backend/src/domain/ports/ITxBuilder.ts` | Added `settingsMeta` optional field to `BuildTxResult` interface |
| `backend/src/application/use-cases/UpdateSettingsUseCase.ts` | Added `settingsMeta` to `UpdateSettingsOutput` interface and pass-through in `execute()` |

---

## 5. Workflow sau deploy

Sau khi gọi API `POST /v1/admin/settings/build-deploy`:

1. Backend trả về response chứa `settingsMeta`:
   ```json
   {
     "unsignedTx": "84...",
     "txHash": "abc123...",
     "settingsMeta": {
       "settingsNftPolicyId": "<intent_policy_id>",
       "settingsNftAssetName": "<blake2b_256_hash>"
     }
   }
   ```

2. Frontend ký TX (CIP-30) → submit lên chain

3. **Cập nhật `.env`** với giá trị từ `settingsMeta`:
   ```env
   SETTINGS_NFT_POLICY_ID=<settingsNftPolicyId>
   SETTINGS_NFT_ASSET_NAME=<settingsNftAssetName>
   ```

4. Restart backend → `resolveSettingsScript()` sẽ sử dụng env vars để parameterize validator đúng cách

5. Frontend Protocol Hub hiển thị **"Parameterized"** (xanh) cho Settings Validator

---

## 6. So sánh trước/sau

| Aspect | Trước | Sau |
|--------|-------|-----|
| NFT Thread Token | ❌ Không có | ✅ Mint via `intent_token_policy` |
| Settings Address | Unparameterized (dev mode) | Parameterized (canonical) |
| On-chain Security | Ai cũng tạo fake UTxO được | Only one-shot NFT holder |
| Frontend Status | 🔴 Unparameterized | 🟢 Parameterized |
| Env Vars | Trống | Được set từ deploy response |
| Deploy Pattern | Inconsistent với Factory | Consistent (cùng pattern) |

---

## 7. Notes kỹ thuật

- **One-shot guarantee**: `intent_token_policy` yêu cầu seed UTxO phải được consume trong TX. Vì UTxO chỉ tồn tại 1 lần, NFT chỉ mint được 1 lần → đảm bảo uniqueness.
- **Token name derivation**: `blake2b_256(cbor_serialise(Constr(0, [txHash, outputIndex])))` — deterministic từ seed UTxO.
- **Deploy order vẫn giữ nguyên**: Settings → Factory. Factory `buildDeployFactoryTx` đã có code lookup settings UTxO để ghi vào `FactoryDatum.settings_utxo`.
- **`resolveSettingsScript()`** vẫn dùng env vars cho các operation khác (update, read state) — chỉ deploy mới tính trực tiếp từ seed.
