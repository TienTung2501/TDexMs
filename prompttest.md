viết lại toàn bộ các script để test backend, kiểm tra xem khi test hệ thống có hoạt động đúng không bao gồm việc kiểm tra các bot, database có hoạt động đúng không. Nhưng trước khi test phải viết script để clear hết các utxo trên tất cả các hợp đồng thông minh trước vì hiện tại vẫn còn utxo trên các hợp đồng mà trước đó tôi đã reset database rồi nên đang có sung đột. TRong file .env tôi có các ví test rồi đấy hãy chia nhau ra test cho đa dạng. Đặc biệt chú ý đến quá trình viết test tạo intent, order các thứ nhé phải làm sao để phản ánh mọi tình huống xảy ra đúng như các bot đã được lập trình. Về các token test trong ví admin tôi đã mint 5 token test đó bao gồm tBTC, tSOL, tUTDT, tPOLYGON, tNEAR, chỉ cần tạo 1 pool để test thôi có thể chuyển các đồng test này sang các ví khác để test nhé. Khi test thì hãy kiểm tra log backend xem có lỗi gì và fix nhé. Để hiểu thêm về kịch bản test và tạo ra một kịch bản đúng hãy thực hiện đọc hợp đồng thông minh, đọc các file liên quan đến build giao dịch, các bot đã được xây dựng để thực hiện xây dựng các script test nhé sao cho đúng logic thứ tự của hệ thống nhất.

Kịch bản xấu nhất:
vào backend test thôi.
Các scripts cần test:
1. clear database
2. clear utxo trên tất cả các hợp đồng

2 cái này đầu tiên tách riêng sau đó cho chung 1 script.

3. Viết script khởi tạo hệ thống:

 Test Run Complete — Phase Summary
════════════════════════════════════════════════════════════════════════
  ✅  Phase 0 — Distribute Test Tokens
  ✅  Phase 1 — Deploy Settings
  ✅  Phase 2 — Deploy Factory
  ✅  Phase 3 — Create tBTC/tUSD Pool
  ❌  Phase 4 — Create tUSD/tSOL Pool  → POST /pools/create → 502: {"status":"error","code":"CHAIN_ERROR","message":"Failed to build create p
  ❌  Phase 5a — User A deposit tBTC/tUSD  → POST /pools/pool_22de76ede018/deposit → 502: {"status":"error","code":"CHAIN_ERROR","message":"Faile
  ⏭   Phase 5b — User B deposit tUSD/tSOL
  ✅  Phase 6 — Swap Intents
  ❌  Phase 7 — Cancel Intent  → DELETE /intents/int_afe7e38cc9e5 → 502: {"status":"error","code":"CHAIN_ERROR","message":"Failed to
  ✅  Phase 8 — Expired Intent
  ✅  Phase 9  — DCA Order
  ✅  Phase 10 — Limit Order
  ✅  Phase 11 — Stop-Loss Order
  ❌  Phase 12 — Cancel Order  → DELETE /orders/ord_7627f0a49b36 → 502: {"status":"error","code":"CHAIN_ERROR","message":"Order UTxO
  ✅  Phase 13 — Expired Order
  ✅  Phase 6b — Observe Intent Fills
  ✅  Phase 9-11b — Observe Order Execution
  ✅  Phase 14 — Withdraw Liquidity
  ✅  Phase 15 — Update Settings

  Total: 14 passed, 4 failed, 1 skipped

  Verify results:
    http://localhost:3001/v1/pools
    http://localhost:3001/v1/intents
    http://localhost:3001/v1/orders
    https://preprod.cardanoscan.io/

    Sao tạo 2 pool đến pool thứ 2 lại lỗi? hãy xem xem lỗi sai đến từ đâu?


    Có cách nào để xử lý 4 lỗi trên không? TÔi không thế sửa hợp đồng được, bạn hãy xem xem là do logic hợp đồng sai, hay build giao dịch bị sai. Nếu build giao dịch sai thì hãy sửa lại backend.