# Printer Bridge K80

Trang web không có quyền mở UDP socket hoặc gửi TCP raw tới máy in. Vì vậy, chạy một ứng dụng **Printer Bridge** trên máy thu ngân (Windows) và chỉ cho phép app này gọi qua `http://127.0.0.1:9150`.

## API cục bộ cần triển khai

`GET /health` trả `200 {"ok":true}`.

`POST /discover` nhận:

```json
{"ports":[3000,9100,4545],"timeoutMs":3500}
```

Bridge gửi UDP broadcast theo từng subnet LAN (không hard-code chỉ `255.255.255.255`; mạng có thể chặn directed broadcast), lắng nghe phản hồi và trả:

```json
{"printers":[{"name":"Xprinter XP-80C","ip":"192.168.1.120","mac":"AA:BB:CC:DD:EE:FF","port":9100}]}
```

`POST /print` nhận `printer`, `paperWidth:80`, `type` và `text`; bridge tạo ESC/POS phù hợp K80 rồi gửi TCP tới IP/port đã được người dùng chọn. Bridge phải đặt timeout, xác nhận IP thuộc LAN, và trả lỗi rõ ràng nếu không kết nối được.

## Yêu cầu an toàn

- Chỉ bind loopback (`127.0.0.1`), không mở cổng cho mạng ngoài.
- Chỉ cho phép origin của app (cấu hình rõ origin); thêm token ngẫu nhiên do bridge cung cấp trước khi gọi `discover`/`print`.
- Không để website tự gửi tới một IP tùy ý; bridge cần allow-list thiết bị sau khi người dùng chọn.
- Xác thực kết quả quét trước khi in: UDP broadcast không đáng tin cậy và nhiều máy in chỉ mở TCP 9100, không phản hồi discovery chuẩn.

Lưu ý: nhiều Xprinter không có giao thức UDP discovery đồng nhất. Cách bền vững là kết hợp UDP discovery, ARP/subnet scan có giới hạn và cho phép nhập IP thủ công; sau đó kiểm tra TCP 9100 trước khi lưu.
