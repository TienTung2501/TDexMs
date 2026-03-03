[14:50:54.518] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 3
    err: {
      "type": "ChainError",
      "message": "Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea",
      "stack":
          DomainError: Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1540:17)
              at runNextTicks (node:internal/process/task_queues:65:5)
              at process.processTimers (node:internal/timers:526:9)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:460:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:370:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:99:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[14:50:55.518] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[14:50:57.644] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    intentCount: 2
    totalInput: "15000000"
    attempt: 4
[14:50:57.644] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[14:50:59.443] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[14:51:00.469] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "97c37c871336d29a2621f93ebc033be2380907ca2cea76827c708408ff143734#1"
[14:51:02.128] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 4
    err: {
      "type": "ChainError",
      "message": "Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea",
      "stack":
          DomainError: Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1540:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:460:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:370:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:99:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[14:51:02.884] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[14:51:04.891] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    intentCount: 2
    totalInput: "15000000"
    attempt: 5
[14:51:04.891] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[14:51:06.441] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[14:51:07.490] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "97c37c871336d29a2621f93ebc033be2380907ca2cea76827c708408ff143734#1"
[14:51:09.155] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 5
    err: {
      "type": "ChainError",
      "message": "Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea",
      "stack":
          DomainError: Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1540:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:460:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:370:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:99:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[14:51:11.824] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[14:51:12.992] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    intentCount: 2
    totalInput: "15000000"
    attempt: 6
[14:51:12.992] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[14:51:15.301] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[14:51:16.453] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "97c37c871336d29a2621f93ebc033be2380907ca2cea76827c708408ff143734#1"
[14:51:21.291] ERROR: Failed to settle sub-batch
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    direction: "AToB"
    intentCount: 2
    err: {
      "type": "ChainError",
      "message": "Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea",
      "stack":
          DomainError: Swap output 8312489 below minimum 431027079 for escrow af3c1168d5e78b0d9607af8b7b221154c1b3ca276f2f3e8f85bb19e3ab5073ea
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1540:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:460:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:370:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:99:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[14:51:21.292] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    intentCount: 1
    totalInput: "250000000"
    attempt: 1
[14:51:21.292] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 1
[14:51:26.504] DEBUG: Pool reserves synced
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_fd618819b430"
    txHash: "a336ba15ebbd6db4088ff9d2c246708fb771f50cbdde7c9eca0f2efcaef81327"
    physicalA: "101000000"
    physicalB: "5050000000"
    protocolFeesA: "0"
    protocolFeesB: "0"
    changed: false
[14:51:27.181] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[14:51:28.083] DEBUG: Pool reserves synced
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    txHash: "97c37c871336d29a2621f93ebc033be2380907ca2cea76827c708408ff143734"
    physicalA: "50000000"
    physicalB: "50000000"
    protocolFeesA: "0"
    protocolFeesB: "0"
    changed: false
[14:51:29.358] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "97c37c871336d29a2621f93ebc033be2380907ca2cea76827c708408ff143734#1"
[14:51:32.700] INFO: Settlement TX timing (using chain time)
    service: "tx-builder"
    network: "preprod"
    chainTimeMs: 1772031058000
    validToMs: 1772031958000
    localTimeMs: 1772031092700
[14:51:32.701] INFO: Settlement TX details before complete()
    service: "tx-builder"
    network: "preprod"
    escrowCount: 1
    poolUtxoRef: "97c37c871336d29a2621f93ebc033be2380907ca2cea76827c708408ff143734#1"
    poolReserves: {
      "physicalA": "8354219",
      "physicalB": "300000000",
      "activeA": "8354219",
      "activeB": "299875063"
    }
    protocolFees: {
      "a": "0",
      "b": "124937"
    }
    newRootK: "50052192"
    burnAssets: {
      "59649503ceb440334416be81803b71ab35c7911d6655157145c7df39cde3d86558bd185f0f87f457603a2c4835435f0e0b591e961d213c1c506ab5b2": "-1"
    }
    ownerPayments: [
      {
        "address": "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8",
        "assets": {
          "lovelace": "2000000",
          "a257a1387d2908c0823a776bc4638ab42217e4682bcd416df0d139de74425443": "41645781"
        }
      }
    ]
    overallDirection: "BToA"
    solverAddress: "addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua"
    intentPolicyId: "59649503ceb440334416be81803b71ab35c7911d6655157145c7df39"
[14:51:32.758] INFO: Settlement TX built
    service: "solver-engine"
    network: "preprod"
    txHash: "645bfb33031f48eef135257ddc741fef8e19488a7511f8c44b0c49eea095f1a0"
    fee: "0"
[14:51:39.932] INFO: Settlement TX signed and submitted ΓÇö awaiting on-chain confirmation
    service: "solver-engine"
    network: "preprod"
    txHash: "645bfb33031f48eef135257ddc741fef8e19488a7511f8c44b0c49eea095f1a0"
    poolId: "pool_fd618819b430"
[14:51:51.472] INFO: POST /v1/tx/confirm 200 860ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "POST"
    url: "/v1/tx/confirm"
    status: 200
    duration: 860
    ip: "::1"
[14:51:52.179] INFO: POST /v1/tx/confirm 200 702ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "POST"
    url: "/v1/tx/confirm"
    status: 200
    duration: 702
    ip: "::1"
[14:51:52.887] INFO: POST /v1/tx/confirm 200 705ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "POST"
    url: "/v1/tx/confirm"
    status: 200
    duration: 705
    ip: "::1"
[14:51:59.255] INFO: Settlement TX confirmed on-chainΓÇ¥ updating DB
    service: "solver-engine"
    network: "preprod"
    txHash: "645bfb33031f48eef135257ddc741fef8e19488a7511f8c44b0c49eea095f1a0"
    poolId: "pool_fd618819b430"
[14:52:03.571] DEBUG: Pool reserves synced
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_fd618819b430"
    txHash: "a336ba15ebbd6db4088ff9d2c246708fb771f50cbdde7c9eca0f2efcaef81327"
    physicalA: "101000000"
    physicalB: "5050000000"
    protocolFeesA: "0"
    protocolFeesB: "0"
    changed: false
[14:52:04.504] DEBUG: Pool reserves synced
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    txHash: "97c37c871336d29a2621f93ebc033be2380907ca2cea76827c708408ff143734"
    physicalA: "50000000"
    physicalB: "50000000"
    protocolFeesA: "0"
    protocolFeesB: "0"
    changed: false
[14:52:08.565] INFO: GET /v1/intents/int_a0356d2c1b07 200 666ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents/int_a0356d2c1b07"
    status: 200
    duration: 666
    ip: "::1"
[14:52:09.906] DEBUG: Recorded price tick after settlement
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    price: 0.01900212
[14:52:21.358] INFO: GET /v1/intents/int_a0356d2c1b07 200 780ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents/int_a0356d2c1b07"
    status: 200
    duration: 780
    ip: "::1"

15:29:48.820] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[15:29:51.199] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    intentCount: 2
    totalInput: "15000000"
    attempt: 4
[15:29:51.199] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[15:29:52.828] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[15:29:53.818] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "a336ba15ebbd6db4088ff9d2c246708fb771f50cbdde7c9eca0f2efcaef81327#0"
[15:29:55.467] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 4
    err: {
      "type": "ChainError",
      "message": "Swap output 197555539 below minimum 225650209 for escrow 0b5350df3db6553a162f445b6e04586a20f51d62d74dc9b8de0420969394f9c1",
      "stack":
          DomainError: Swap output 197555539 below minimum 225650209 for escrow 0b5350df3db6553a162f445b6e04586a20f51d62d74dc9b8de0420969394f9c1
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1540:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:460:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:370:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:99:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[15:29:57.272] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[15:29:58.528] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    intentCount: 2
    totalInput: "15000000"
    attempt: 5
[15:29:58.528] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[15:30:00.909] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[15:30:01.951] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "a336ba15ebbd6db4088ff9d2c246708fb771f50cbdde7c9eca0f2efcaef81327#0"
[15:30:02.820] DEBUG: Pool reserves synced
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_fd618819b430"
    txHash: "a336ba15ebbd6db4088ff9d2c246708fb771f50cbdde7c9eca0f2efcaef81327"
    physicalA: "101000000"
    physicalB: "5050000000"
    protocolFeesA: "0"
    protocolFeesB: "0"
    changed: false
[15:30:03.789] DEBUG: Pool reserves synced
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    txHash: "645bfb33031f48eef135257ddc741fef8e19488a7511f8c44b0c49eea095f1a0"
    physicalA: "300000000"
    physicalB: "8354219"
    protocolFeesA: "0"
    protocolFeesB: "124937"
    changed: false
[15:30:03.904] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 5
    err: {
      "type": "ChainError",
      "message": "Swap output 197555539 below minimum 225650209 for escrow 0b5350df3db6553a162f445b6e04586a20f51d62d74dc9b8de0420969394f9c1",
      "stack":
          DomainError: Swap output 197555539 below minimum 225650209 for escrow 0b5350df3db6553a162f445b6e04586a20f51d62d74dc9b8de0420969394f9c1
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1540:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:460:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:370:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:99:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[15:30:04.606] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[15:30:06.608] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    intentCount: 2
    totalInput: "15000000"
    attempt: 6
[15:30:06.609] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[15:30:08.192] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[15:30:09.219] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "a336ba15ebbd6db4088ff9d2c246708fb771f50cbdde7c9eca0f2efcaef81327#0"
[15:30:14.706] ERROR: Failed to settle sub-batch
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_fd618819b430"
    direction: "AToB"
    intentCount: 2
    err: {
      "type": "ChainError",
      "message": "Swap output 197555539 below minimum 225650209 for escrow 0b5350df3db6553a162f445b6e04586a20f51d62d74dc9b8de0420969394f9c1",
      "stack":
          DomainError: Swap output 197555539 below minimum 225650209 for escrow 0b5350df3db6553a162f445b6e04586a20f51d62d74dc9b8de0420969394f9c1
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1540:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:460:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:370:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:99:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }