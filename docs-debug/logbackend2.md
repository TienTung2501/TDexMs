[08:47:33.353] DEBUG: GET /v1/pools?state=ACTIVE&limit=50 304 2086ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/pools?state=ACTIVE&limit=50"
    status: 304
    duration: 2086
    ip: "::1"
[08:47:33.695] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[08:47:33.903] DEBUG: GET /v1/intents?limit=50 304 2028ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?limit=50"
    status: 304
    duration: 2028
    ip: "::1"
[08:47:33.984] ERROR: Unhandled error
    service: "solvernet-backend"
    network: "preprod"
    middleware: "error-handler"
    err: {
      "type": "SyntaxError",
      "message": "Cannot convert [object Object] to a BigInt",
      "stack":
          SyntaxError: Cannot convert [object Object] to a BigInt
              at BigInt (<anonymous>)
              at GetPortfolio.resolveLpPositions (D:\Code\decentralize\backend\src\application\use-cases\GetPortfolio.ts:123:35)
              at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
              at async GetPortfolio.execute (D:\Code\decentralize\backend\src\application\use-cases\GetPortfolio.ts:73:25)
              at async <anonymous> (D:\Code\decentralize\backend\src\interface\http\routes\portfolio.ts:586:24)    
    }
[08:47:33.986] WARN: GET /v1/portfolio/addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua 500 7035ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/portfolio/addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua"
    status: 500
    duration: 7035
    ip: "::1"
[08:47:34.003] DEBUG: GET /v1/intents?address=addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua&limit=50 304 806ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?address=addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua&limit=50"
    status: 304
    duration: 806
    ip: "::1"
[08:47:34.300] DEBUG: GET /v1/chart/candles?poolId=pool_bc7cc8c68e51&interval=4h&limit=200 304 1084ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/chart/candles?poolId=pool_bc7cc8c68e51&interval=4h&limit=200"
    status: 304
    duration: 1084
    ip: "::1"
[08:47:34.662] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "7a189c8a61e47c037d23854cf091c4da2d61fe625b86ca10c246ee0545d17c8b#0"
[08:47:34.749] DEBUG: GET /v1/intents?limit=50 304 843ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?limit=50"
    status: 304
    duration: 843
    ip: "::1"

[08:49:03.111] DEBUG: GET /v1/intents?limit=50 304 892ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?limit=50"
    status: 304
    duration: 892
    ip: "::1"
[08:49:03.971] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 4
    err: {
      "type": "ChainError",
      "message": "Swap output 1133101801 below minimum 1140250655 for escrow 48532137f7015c2481f82427ca53adb9c1896d6cc4888da1a8db2b5db2ffcfe5",
      "stack":
          DomainError: Swap output 1133101801 below minimum 1140250655 for escrow 48532137f7015c2481f82427ca53adb9c1896d6cc4888da1a8db2b5db2ffcfe5
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1837:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:524:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:434:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:154:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[08:49:04.717] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[08:49:06.533] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    intentCount: 2
    totalInput: "500297062"
    attempt: 5
[08:49:06.534] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[08:49:08.160] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"

[08:52:15.834] INFO: Batches built
    service: "batch-builder"
    network: "preprod"
    groups: 2
    totalIntents: 3
[08:52:16.535] INFO: Netting analysis
    service: "netting-engine"
    network: "preprod"
    aToBCount: 0
    bToACount: 2
    grossAToB: "0"
    grossBToA: "500297062"
[08:52:16.536] WARN: Escrow below min output ΓÇö skipping in batch
    service: "netting-engine"
    network: "preprod"
    txHash: "48532137f7015c2481f82427ca53adb9c1896d6cc4888da1a8db2b5db2ffcfe5"
    output: "1133582558"
    minRequired: "1140250655"
[08:52:16.536] DEBUG: NettingEngine analysis (single direction ΓÇö no netting possible)
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    intentCount: 2
    aToBCount: 0
    bToACount: 2
    grossAToB: "0"
    grossBToA: "500297062"
    netAToB: "0"
    netBToA: "297062"
    completeFills: 1
    partialFills: 0
    ammOutput: "24049942"
    hasOpposing: false
    nettingSavings: "N/A (single direction)"
[08:52:16.536] DEBUG: NettingEngine fill allocation
    service: "solver-engine"
    network: "preprod"
    escrow: "912c0be53029ΓÇª#0"
    direction: "BToA"
    inputConsumed: "297062"
    outputDelivered: "24049942"
    isComplete: true
    owner: "55ca3a02999283b2d9ebΓÇª"
[08:52:17.203] DEBUG: GET /v1/chart/price/pool_bc7cc8c68e51 304 994ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/chart/price/pool_bc7cc8c68e51"
    status: 304
    duration: 994
    ip: "::1"
[08:52:17.234] DEBUG: Settling batch of same-direction intents in single TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    direction: "BToA"
    intentCount: 2
[08:52:17.236] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    intentCount: 2
    totalInput: "500297062"
    attempt: 1
[08:52:17.238] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[08:52:18.316] DEBUG: Protocol stats snapshot created
    service: "pool-snapshot-cron"
    network: "preprod"
    pools: 2
    uniqueTraders: 2
    intentsFilled: 15
[08:52:19.131] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[08:52:20.098] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "7a189c8a61e47c037d23854cf091c4da2d61fe625b86ca10c246ee0545d17c8b#0"
[08:52:20.153] INFO: Swap intent submitted
    service: "swap-bot"
    network: "preprod"
    intentId: "int_be576ee056e9"
    txHash: "d9a2a33580d3f5b9"
[08:52:22.275] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 1
    err: {
      "type": "ChainError",
      "message": "Swap output 1133101801 below minimum 1140250655 for escrow 48532137f7015c2481f82427ca53adb9c1896d6cc4888da1a8db2b5db2ffcfe5",
      "stack":
          DomainError: Swap output 1133101801 below minimum 1140250655 for escrow 48532137f7015c2481f82427ca53adb9c1896d6cc4888da1a8db2b5db2ffcfe5
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1837:17)
              at runNextTicks (node:internal/process/task_queues:65:5)
              at listOnTimeout (node:internal/timers:555:9)
              at process.processTimers (node:internal/timers:529:7)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:524:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:434:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:154:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[08:52:23.031] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[08:52:23.605] INFO: TX submitted
    service: "liquidity-bot"
    network: "preprod"
    label: "deposit"
    txHash: "314ab96aeb518170"
[08:52:25.114] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    intentCount: 2
    totalInput: "500297062"
    attempt: 2
[08:52:25.114] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"
    intentCount: 2
[08:52:26.366] DEBUG: GET /v1/chart/price/pool_bc7cc8c68e51 304 130ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/chart/price/pool_bc7cc8c68e51"
    status: 304
    duration: 130
    ip: "::1"
[08:52:26.695] INFO: Pool UTxO not found by ref ΓÇö scanning pool address for NFT match
    service: "tx-builder"
    network: "preprod"
[08:52:26.977] DEBUG: GET /v1/pools?state=ACTIVE&limit=50 200 743ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/pools?state=ACTIVE&limit=50"
    status: 200
    duration: 743
    ip: "::1"
[08:52:27.038] DEBUG: GET /v1/intents?limit=50 200 803ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?limit=50"
    status: 200
    duration: 803
    ip: "::1"
[08:52:27.571] DEBUG: GET /v1/intents?address=addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua&limit=50 304 1331ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?address=addr_test1qp0w79aen4gek54u5hmq4wpzvwla4as4w0zjtqneu2vdkrh5hkxs54ravf80yf8t4y4a8st6mk54y6lschdjq0d6l9mqku2nua&limit=50"
    status: 304
    duration: 1331
    ip: "::1"
[08:52:27.645] INFO: Found pool UTxO by scanning pool address
    service: "tx-builder"
    network: "preprod"
    poolUtxoRef: "7a189c8a61e47c037d23854cf091c4da2d61fe625b86ca10c246ee0545d17c8b#0"
[08:52:27.715] DEBUG: GET /v1/analytics/overview 200 1483ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/analytics/overview"
    status: 200
    duration: 1483
    ip: "::1"
[08:52:27.776] DEBUG: GET /v1/intents?limit=50 304 735ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?limit=50"
    status: 304
    duration: 735
    ip: "::1"
[08:52:29.781] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 2
    err: {
      "type": "ChainError",
      "message": "Swap output 1133101801 below minimum 1140250655 for escrow 48532137f7015c2481f82427ca53adb9c1896d6cc4888da1a8db2b5db2ffcfe5",
      "stack":
          DomainError: Swap output 1133101801 below minimum 1140250655 for escrow 48532137f7015c2481f82427ca53adb9c1896d6cc4888da1a8db2b5db2ffcfe5
              at TxBuilder.buildSettlementTx (D:\Code\decentralize\backend\src\infrastructure\cardano\TxBuilder.ts:1837:17)
              at async SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:524:26)   
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:434:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:154:9)
      "code": "CHAIN_ERROR",
      "name": "DomainError"
    }
[08:52:30.674] DEBUG: Pool cache refreshed

[08:54:13.059] DEBUG: GET /v1/intents?limit=50 304 1030ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?limit=50"
    status: 304
    duration: 1030
    ip: "::1"
[08:54:15.339] ERROR: Prisma error
    service: "solvernet-backend"
    network: "preprod"
    message: "\nInvalid `this.prisma.pool.update()` invocation in\nD:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:142:32\n\n  139   protocolFeeAccB: protocolFeesB.toString(),\n  140 };\n  141 \nΓåÆ 142 await this.prisma.pool.update({\n        where: {\n          id: \"pool_bc7cc8c68e51\"\n        },\n        data: {\n          txHash: \"314ab96aeb51817009e2e877c7e6bdebacf3420ddc350155eccfb3df9d2f17bc\",\n          outputIndex: 0,\n          reserveA: \"[object Object]\",\n                    ~~~~~~~~~~~~~~~~~\n          reserveB: \"[object Object]\",\n          totalLpTokens: \"131996989\",\n          protocolFeeAccA: \"957\",\n          protocolFeeAccB: \"301752\"\n        }\n      })\n\nInvalid value for argument `reserveA`: invalid digit found in string. Expected decimal String."
    target: "pool.update"
[08:54:15.339] ERROR: Failed to sync pool
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    err: {
      "type": "PrismaClientValidationError",
      "message": "\nInvalid `this.prisma.pool.update()` invocation in\nD:\\Code\\decentralize\\backend\\src\\infrastructure\\cardano\\ChainSync.ts:142:32\n\n  139   protocolFeeAccB: protocolFeesB.toString(),\n  140 };\n  141 \nΓåÆ 142 await this.prisma.pool.update({\n        where: {\n          id: \"pool_bc7cc8c68e51\"\n        },\n        data: {\n          txHash: \"314ab96aeb51817009e2e877c7e6bdebacf3420ddc350155eccfb3df9d2f17bc\",\n          outputIndex: 0,\n          reserveA: \"[object Object]\",\n                    ~~~~~~~~~~~~~~~~~\n          reserveB: \"[object Object]\",\n          totalLpTokens: \"131996989\",\n          protocolFeeAccA: \"957\",\n          protocolFeeAccB: \"301752\"\n        }\n      })\n\nInvalid value for argument `reserveA`: invalid digit found in string. Expected decimal String.",
      "stack":
          PrismaClientValidationError:
          Invalid `this.prisma.pool.update()` invocation in
          D:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:142:32

            139   protocolFeeAccB: protocolFeesB.toString(),
            140 };
            141
          ΓåÆ 142 await this.prisma.pool.update({
                  where: {
                    id: "pool_bc7cc8c68e51"
                  },
                  data: {
                    txHash: "314ab96aeb51817009e2e877c7e6bdebacf3420ddc350155eccfb3df9d2f17bc",
                    outputIndex: 0,
                    reserveA: "[object Object]",
                              ~~~~~~~~~~~~~~~~~
                    reserveB: "[object Object]",
                    totalLpTokens: "131996989",
                    protocolFeeAccA: "957",
                    protocolFeeAccB: "301752"
                  }
                })

          Invalid value for argument `reserveA`: invalid digit found in string. Expected decimal String.
              at throwValidationException (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\core\errorRendering\throwValidationException.ts:45:9)
              at ei.handleRequestError (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\RequestHandler.ts:202:7)
              at ei.handleAndLogRequestError (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\RequestHandler.ts:174:12)        
              at ei.request (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\RequestHandler.ts:143:12)
              at async a (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\getPrismaClient.ts:833:24)
              at async ChainSync.syncPools (D:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:142:9)
              at async ChainSync.start (D:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:45:9) 
      "name": "PrismaClientValidationError",
      "clientVersion": "6.19.2"
    }
[08:54:15.391] ERROR: Prisma error
    service: "solvernet-backend"
    network: "preprod"
    message: "\nInvalid `this.prisma.pool.update()` invocation in\nD:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:142:32\n\n  139   protocolFeeAccB: protocolFeesB.toString(),\n  140 };\n  141 \nΓåÆ 142 await this.prisma.pool.update({\n        where: {\n          id: \"pool_fd618819b430\"\n        },\n        data: {\n          txHash: \"c561c57413a320a9c9b4018fa08b321ef89288d3174746dcd002d30af1d2e1fe\",\n          outputIndex: 0,\n          reserveA: \"[object Object]\",\n                    ~~~~~~~~~~~~~~~~~\n          reserveB: \"[object Object]\",\n          totalLpTokens: \"959923986\",\n          protocolFeeAccA: \"2570\",\n          protocolFeeAccB: \"817911\"\n        }\n      })\n\nInvalid value for argument `reserveA`: invalid digit found in string. Expected decimal String."
    target: "pool.update"
[08:54:15.391] ERROR: Failed to sync pool
    service: "chain-sync"
    network: "preprod"
    poolId: "pool_fd618819b430"
    err: {
      "type": "PrismaClientValidationError",
      "message": "\nInvalid `this.prisma.pool.update()` invocation in\nD:\\Code\\decentralize\\backend\\src\\infrastructure\\cardano\\ChainSync.ts:142:32\n\n  139   protocolFeeAccB: protocolFeesB.toString(),\n  140 };\n  141 \nΓåÆ 142 await this.prisma.pool.update({\n        where: {\n          id: \"pool_fd618819b430\"\n        },\n        data: {\n          txHash: \"c561c57413a320a9c9b4018fa08b321ef89288d3174746dcd002d30af1d2e1fe\",\n          outputIndex: 0,\n          reserveA: \"[object Object]\",\n                    ~~~~~~~~~~~~~~~~~\n          reserveB: \"[object Object]\",\n          totalLpTokens: \"959923986\",\n          protocolFeeAccA: \"2570\",\n          protocolFeeAccB: \"817911\"\n        }\n      })\n\nInvalid value for argument `reserveA`: invalid digit found in string. Expected decimal String.",
      "stack":
          PrismaClientValidationError:
          Invalid `this.prisma.pool.update()` invocation in
          D:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:142:32

            139   protocolFeeAccB: protocolFeesB.toString(),
            140 };
            141
          ΓåÆ 142 await this.prisma.pool.update({
                  where: {
                    id: "pool_fd618819b430"
                  },
                  data: {
                    txHash: "c561c57413a320a9c9b4018fa08b321ef89288d3174746dcd002d30af1d2e1fe",
                    outputIndex: 0,
                    reserveA: "[object Object]",
                              ~~~~~~~~~~~~~~~~~
                    reserveB: "[object Object]",
                    totalLpTokens: "959923986",
                    protocolFeeAccA: "2570",
                    protocolFeeAccB: "817911"
                  }
                })

          Invalid value for argument `reserveA`: invalid digit found in string. Expected decimal String.
              at throwValidationException (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\core\errorRendering\throwValidationException.ts:45:9)
              at ei.handleRequestError (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\RequestHandler.ts:202:7)
              at ei.handleAndLogRequestError (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\RequestHandler.ts:174:12)        
              at ei.request (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\RequestHandler.ts:143:12)
              at async a (D:\Code\decentralize\node_modules\.pnpm\@prisma+client@6.19.2_prisma@6.19.2_typescript@5.9.3__typescript@5.9.3\node_modules\@prisma\client\src\runtime\getPrismaClient.ts:833:24)
              at async ChainSync.syncPools (D:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:142:9)
              at async ChainSync.start (D:\Code\decentralize\backend\src\infrastructure\cardano\ChainSync.ts:45:9) 
      "name": "PrismaClientValidationError",
      "clientVersion": "6.19.2"
    }
[08:54:17.180] DEBUG: GET /v1/chart/price/pool_bc7cc8c68e51 304 961ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/chart/price/pool_bc7cc8c68e51"
    status: 304
    duration: 961
    ip: "::1"
[08:54:18.794] DEBUG: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 4
    total: 4
[08:54:21.478] DEBUG: Processing intents (filtered stale UTxOs)
    service: "solver-engine"
    network: "preprod"
    chainCount: 4
    dbVerifiedCount: 4
[08:54:22.157] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2
[08:54:22.157] DEBUG: Full fill route does not meet pro-rata min output ΓÇö trying partial fill
    service: "route-optimizer"
    network: "preprod"
    inputAmount: "23323123"
    bestOutput: "275209"
    proRataMinOutput: "389652"
[08:54:22.157] DEBUG: Partial fill amount cannot satisfy 10% rule and slippage simultaneously
    service: "route-optimizer"
    network: "preprod"
    intentId: "572120380d"
    partialInput: "179"
    minRequired: "2332312"
[08:54:22.157] WARN: No route found (full or partial)
    service: "route-optimizer"
    network: "preprod"
    input: "a257a1387d2908c0823a776bc4638ab42217e4682bcd416df0d139de.7455534454"
    output: "20446ece88e97c06cdac86db0dbf7515b44a3de4aa09e04c66ea0340.74534f4c"
    remainingInput: "23323123"
    canPartialFill: true
[08:54:22.158] INFO: Batches built
    service: "batch-builder"
    network: "preprod"
    groups: 1
    totalIntents: 3
[08:54:22.830] INFO: Netting analysis
    service: "netting-engine"
    network: "preprod"
    aToBCount: 1
    bToACount: 2
    grossAToB: "23819751"
    grossBToA: "500297062"
[08:54:22.830] INFO: Netting plan computed
    service: "netting-engine"
    network: "preprod"
    netAToB: "0"
    netBToA: "500009646"
    ammOutput: "1158308483"
    completeFills: 3
    partialFills: 0
    nettingRatio: "5%"
[08:54:22.831] INFO: ΓÜí NettingEngine: opposing intents detected ΓÇö cross-matching analysis
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    intentCount: 3
    aToBCount: 1
    bToACount: 2
    grossAToB: "23819751"
    grossBToA: "500297062"
    netAToB: "0"
    netBToA: "500009646"
    completeFills: 3
    partialFills: 0
    ammOutput: "1158308483"
    hasOpposing: true
    nettingSavings: "5% of flow cross-matched"
[08:54:22.831] DEBUG: NettingEngine fill allocation
    service: "solver-engine"
    network: "preprod"
    escrow: "d9a2a33580d3ΓÇª#0"
    direction: "AToB"
    inputConsumed: "23819751"
    outputDelivered: "287416"
    isComplete: true
    owner: "55ca3a02999283b2d9ebΓÇª"
[08:54:22.831] DEBUG: NettingEngine fill allocation
    service: "solver-engine"
    network: "preprod"
    escrow: "912c0be53029ΓÇª#0"
    direction: "BToA"
    inputConsumed: "297062"
    outputDelivered: "687770"
    isComplete: true
    owner: "55ca3a02999283b2d9ebΓÇª"
[08:54:22.831] DEBUG: NettingEngine fill allocation
    service: "solver-engine"
    network: "preprod"
    escrow: "48532137f701ΓÇª#0"
    direction: "BToA"
    inputConsumed: "500000000"
    outputDelivered: "1157620712"
    isComplete: true
    owner: "55ca3a02999283b2d9ebΓÇª"
[08:54:23.505] INFO: ΓÜí Mixed-direction batch ΓåÆ splitting into same-direction sub-batches
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    aToBCount: 1
    bToACount: 2
[08:54:23.505] INFO: Building settlement TX
    service: "solver-engine"
    network: "preprod"
    poolId: "pool_bc7cc8c68e51"
    intentCount: 1
    totalInput: "23819751"
    attempt: 1
[08:54:23.505] INFO: Building settlement TX (escrow fill)
    service: "tx-builder"
    network: "preprod"

[08:54:27.830] DEBUG: GET /v1/analytics/overview 304 1608ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/analytics/overview"
    status: 304
    duration: 1608
    ip: "::1"
[08:54:27.933] DEBUG: GET /v1/intents?limit=50 304 727ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?limit=50"
    status: 304
    duration: 727
    ip: "::1"
[08:54:33.744] WARN: Settlement failed, retrying...
    service: "solver-engine"
    network: "preprod"
    attempt: 1
    err: {
      "type": "Error",
      "message": "TX sign/submit failed: Error: {\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayMempoolFailure \\\"All inputs are spent. Transaction has probably already been included\\\"\"],\"kind\":\"ShelleyTxValidationError\"},\"tag\":\"TxValidationErrorInCardanoMode\"},\"tag\":\"TxCmdTxSubmitValidationError\"},\"tag\":\"TxSubmitFail\"}",
      "stack":
          Error: TX sign/submit failed: Error: {"contents":{"contents":{"contents":{"era":"ShelleyBasedEraConway","error":["ConwayMempoolFailure \"All inputs are spent. Transaction has probably already been included\""],"kind":"ShelleyTxValidationError"},"tag":"TxValidationErrorInCardanoMode"},"tag":"TxCmdTxSubmitValidationError"},"tag":"TxSubmitFail"}
              at SolverEngine.settleBatch (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:562:17)
              at async SolverEngine.runIteration (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:477:13)  
              at async SolverEngine.start (D:\Code\decentralize\backend\src\solver\SolverEngine.ts:154:9)
    }
[08:54:34.415] DEBUG: Pool cache refreshed
    service: "route-optimizer"
    network: "preprod"
    poolCount: 2