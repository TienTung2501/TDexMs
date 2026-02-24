[08:32:11.687] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:32:12.451] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:32:12.451] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:32:20.101] INFO: GET /v1/intents?status=FILLED&limit=50 304 883ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 883
    ip: "::1"
[08:32:27.629] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:32:28.384] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:32:29.136] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:32:29.873] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:32:30.619] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:32:31.291] DEBUG: No executable orders found
    service: "order-executor"
    network: "preprod"
[08:32:31.360] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:32:32.109] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:32:32.844] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:32:33.259] INFO: Found expired orders with escrow UTxOs ΓÇö attempting reclaim
    service: "reclaim-keeper"
    network: "preprod"
    count: 2
[08:32:33.259] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
[08:32:33.259] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "f9d2736a334fdde85861fc0f1a3c24dbdbbbb47fa2272804bed98f8a82c88a34"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:32:33.585] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:32:33.585] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:32:35.078] INFO: GET /v1/intents?status=FILLED&limit=50 304 868ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 868
    ip: "::1"
[08:32:35.169] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:32:35.169] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
[08:32:35.170] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "accae35514273b1b74b8298df038901b1c4feda8c503223815ac7e388017fc6c"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:32:37.279] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:32:49.384] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:32:50.142] INFO: GET /v1/intents?status=FILLED&limit=50 304 915ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 915
    ip: "::1"
[08:32:50.260] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:32:51.008] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:32:51.786] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:32:52.523] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:32:53.251] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:32:53.991] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:32:54.723] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:32:55.456] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:32:55.456] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:33:03.220] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "1f2ee7ea-d0ad-42e0-8b17-1543d2649059"
    total: 0
[08:33:03.955] INFO: GET /v1/pools/pool_8253426c751f 304 733ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/pools/pool_8253426c751f"
    status: 304
    duration: 733
    ip: "::1"
[08:33:04.002] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "65fd3719-90cf-4069-9059-33447e009087"
    total: 1
[08:33:04.009] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "65fd3719-90cf-4069-9059-33447e009087"
    total: 0
[08:33:04.020] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "0988481d-7874-47f2-a2ad-c6592b808502"
    total: 1
[08:33:04.944] INFO: GET /v1/intents?status=FILLED&limit=50 304 941ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 941
    ip: "::1"
[08:33:05.844] INFO: GET /v1/intents?status=FILLED&limit=50 304 895ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 895
    ip: "::1"
[08:33:10.594] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:33:11.355] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:33:12.102] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:33:12.847] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:33:13.586] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:33:14.341] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:33:15.080] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:33:15.821] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:33:16.558] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:33:16.558] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:33:19.944] INFO: GET /v1/intents?status=FILLED&limit=50 304 731ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 731
    ip: "::1"
[08:33:32.127] DEBUG: No executable orders found
    service: "order-executor"
    network: "preprod"
[08:33:32.390] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:33:33.051] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:33:33.504] INFO: Found expired orders with escrow UTxOs ΓÇö attempting reclaim
    service: "reclaim-keeper"
    network: "preprod"
    count: 2
[08:33:33.504] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
[08:33:33.504] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "f9d2736a334fdde85861fc0f1a3c24dbdbbbb47fa2272804bed98f8a82c88a34"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:33:33.710] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:33:34.406] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:33:35.126] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:33:35.413] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:33:35.413] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
[08:33:35.413] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "accae35514273b1b74b8298df038901b1c4feda8c503223815ac7e388017fc6c"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:33:35.806] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:33:36.095] INFO: GET /v1/intents?status=FILLED&limit=50 304 1886ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 1886
    ip: "::1"
[08:33:36.492] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:33:37.218] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:33:37.346] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:33:37.886] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:33:37.886] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:33:50.314] INFO: GET /v1/intents?status=FILLED&limit=50 304 1103ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 1103
    ip: "::1"
[08:33:53.123] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:33:53.778] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:33:54.444] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:33:55.111] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:33:55.783] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:33:56.448] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:33:57.112] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:33:57.771] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:33:58.489] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:33:58.489] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:34:03.213] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "0988481d-7874-47f2-a2ad-c6592b808502"
    total: 0
[08:34:03.876] INFO: GET /v1/pools/pool_8253426c751f 304 673ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/pools/pool_8253426c751f"
    status: 304
    duration: 673
    ip: "::1"
[08:34:03.936] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "6dd26901-0753-4e4a-8ce0-713f72192560"
    total: 1
[08:34:03.945] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "6dd26901-0753-4e4a-8ce0-713f72192560"
    total: 0
[08:34:03.952] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "807d1a71-2f44-4113-a3b7-3e10e81f508d"
    total: 1
[08:34:04.784] INFO: GET /v1/intents?status=FILLED&limit=50 304 847ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 847
    ip: "::1"
[08:34:05.714] INFO: GET /v1/intents?status=FILLED&limit=50 304 929ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 929
    ip: "::1"
[08:34:14.401] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:34:15.159] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:34:15.916] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:34:16.677] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:34:17.760] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:34:18.514] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:34:19.312] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:34:20.061] INFO: GET /v1/intents?status=FILLED&limit=50 304 847ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 847
    ip: "::1"
[08:34:20.073] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:34:20.980] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:34:20.980] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:34:32.150] DEBUG: No executable orders found
    service: "order-executor"
    network: "preprod"
[08:34:33.291] INFO: Found expired orders with escrow UTxOs ΓÇö attempting reclaim
    service: "reclaim-keeper"
    network: "preprod"
    count: 2
[08:34:33.291] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
[08:34:33.291] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "f9d2736a334fdde85861fc0f1a3c24dbdbbbb47fa2272804bed98f8a82c88a34"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:34:35.031] INFO: GET /v1/intents?status=FILLED&limit=50 304 826ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 826
    ip: "::1"
[08:34:35.982] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:34:35.982] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
[08:34:35.982] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "accae35514273b1b74b8298df038901b1c4feda8c503223815ac7e388017fc6c"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:34:36.119] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:34:36.863] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:34:37.637] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:34:38.074] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:34:38.385] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:34:39.192] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:34:39.951] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:34:40.694] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:34:41.432] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:34:42.170] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:34:42.170] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:34:50.106] INFO: GET /v1/intents?status=FILLED&limit=50 304 887ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 887
    ip: "::1"
[08:34:59.223] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:35:00.081] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:35:00.819] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:35:01.555] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:35:02.300] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:35:03.044] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:35:03.210] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "807d1a71-2f44-4113-a3b7-3e10e81f508d"
    total: 0
[08:35:03.781] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:35:03.993] INFO: GET /v1/pools/pool_8253426c751f 304 785ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/pools/pool_8253426c751f"
    status: 304
    duration: 785
    ip: "::1"
[08:35:04.060] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "6e3bd87a-b7f7-4bc9-8240-ec11baaec2b4"
    total: 1
[08:35:04.061] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "6e3bd87a-b7f7-4bc9-8240-ec11baaec2b4"
    total: 0
[08:35:04.087] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "aa7e2ecb-2e9b-4d1a-aa35-9b41d147b2ff"
    total: 1
[08:35:04.632] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:35:04.978] INFO: GET /v1/intents?status=FILLED&limit=50 304 918ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 918
    ip: "::1"
[08:35:05.518] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:35:05.518] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:35:05.833] INFO: GET /v1/intents?status=FILLED&limit=50 304 852ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 852
    ip: "::1"
[08:35:20.052] INFO: GET /v1/intents?status=FILLED&limit=50 304 846ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 846
    ip: "::1"
[08:35:20.686] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:35:21.407] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:35:22.104] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:35:22.802] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:35:23.503] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:35:24.213] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:35:24.916] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:35:25.617] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:35:26.327] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:35:26.327] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:35:31.449] DEBUG: Pool history snapshots created
    service: "pool-snapshot-cron"
    network: "preprod"
    snapshotCount: 1
[08:35:32.048] DEBUG: No executable orders found
    service: "order-executor"
    network: "preprod"
[08:35:33.495] INFO: Found expired orders with escrow UTxOs ΓÇö attempting reclaim
    service: "reclaim-keeper"
    network: "preprod"
    count: 2
[08:35:33.495] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
[08:35:33.495] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "f9d2736a334fdde85861fc0f1a3c24dbdbbbb47fa2272804bed98f8a82c88a34"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:35:34.959] INFO: GET /v1/intents?status=FILLED&limit=50 304 739ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 739
    ip: "::1"
[08:35:35.674] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_7a2c423b94b8"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:35:35.674] INFO: Building order reclaim TX (ReclaimOrder redeemer)
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
[08:35:35.674] INFO: Building reclaim order TX for expired order
    service: "tx-builder"
    network: "preprod"
    orderTxHash: "accae35514273b1b74b8298df038901b1c4feda8c503223815ac7e388017fc6c"
    ownerAddress: "addr_test1qqhc0le5xnlmr66y3depes3y4htz8823484tkd5337uhse6048dwqfkspkjlfr5qw5ah5v23zdfzp0ys33wl9dmzumvq2en2w8"
[08:35:35.827] DEBUG: Protocol stats snapshot created
    service: "pool-snapshot-cron"
    network: "preprod"
    pools: 1
    uniqueTraders: 0
    intentsFilled: 0
[08:35:37.606] WARN: Failed to reclaim order ΓÇö will retry next tick
    service: "reclaim-keeper"
    network: "preprod"
    orderId: "ord_4fed5c69cdd0"
    error: "Order UTxO not found on-chain. May already be reclaimed or executed."
[08:35:42.122] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:35:42.844] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:35:43.560] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:35:44.257] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:35:44.971] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:35:45.680] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:35:46.377] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:35:47.117] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:35:47.810] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:35:47.810] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:35:50.092] INFO: GET /v1/intents?status=FILLED&limit=50 304 884ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 884
    ip: "::1"
[08:36:03.073] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:36:03.215] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "aa7e2ecb-2e9b-4d1a-aa35-9b41d147b2ff"
    total: 0
[08:36:03.778] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"
[08:36:04.072] INFO: GET /v1/pools/pool_8253426c751f 304 859ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/pools/pool_8253426c751f"
    status: 304
    duration: 859
    ip: "::1"
[08:36:04.117] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "0226de06-6265-43dc-a87d-2a40cc575cbd"
    total: 1
[08:36:04.123] INFO: WS client disconnected
    service: "websocket"
    network: "preprod"
    clientId: "0226de06-6265-43dc-a87d-2a40cc575cbd"
    total: 0
[08:36:04.132] INFO: WS client connected
    service: "websocket"
    network: "preprod"
    clientId: "125844e2-e854-4f9c-b7e7-6b86edbc7290"
    total: 1
[08:36:04.594] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_8bd63a0de7ab"
    status: "CREATED"
[08:36:05.147] INFO: GET /v1/intents?status=FILLED&limit=50 304 1029ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 1029
    ip: "::1"
[08:36:05.540] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d89ea4b79285"
    status: "CREATED"
[08:36:05.966] INFO: GET /v1/intents?status=FILLED&limit=50 304 817ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 817
    ip: "::1"
[08:36:06.244] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_d48ac56b1df0"
    status: "CREATED"
[08:36:06.988] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_01a0becc4710"
    status: "CREATED"
[08:36:07.760] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_c095f27a1bb1"
    status: "CREATED"
[08:36:08.472] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_685f5488ef0d"
    status: "CREATED"
[08:36:09.176] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_84c29ec99f4f"
    status: "CANCELLING"
[08:36:09.176] DEBUG: No DB-verified active intents after filtering
    service: "solver-engine"
    network: "preprod"
[08:36:19.953] INFO: GET /v1/intents?status=FILLED&limit=50 304 740ms
    service: "solvernet-backend"
    network: "preprod"
    middleware: "request-logger"
    method: "GET"
    url: "/v1/intents?status=FILLED&limit=50"
    status: 304
    duration: 740
    ip: "::1"
[08:36:25.032] INFO: Collected active intents
    service: "intent-collector"
    network: "preprod"
    count: 8
    total: 8
[08:36:25.965] DEBUG: Skipping non-ACTIVE DB intent
    service: "solver-engine"
    network: "preprod"
    intentId: "int_e60f4c67c7a1"
    status: "CREATED"

