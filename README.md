# Bản đồ Camera Giao thông TP.HCM

Ứng dụng web hiển thị camera giao thông trên bản đồ TP.HCM, hỗ trợ tìm địa điểm, định vị người dùng, tìm tuyến đường và liệt kê các camera nằm gần tuyến di chuyển.

## Chức năng

- Hiển thị camera giao thông trên nền bản đồ OpenStreetMap.
- Gom nhóm camera khi bản đồ ở mức thu nhỏ và bung camera khi phóng to.
- Xem ảnh camera trực tiếp trong popup.
- Tìm kiếm địa chỉ và địa điểm tại Việt Nam.
- Chọn nơi đi bằng vị trí hiện tại hoặc nhập địa chỉ thủ công.
- Tìm tuyến đường ô tô đến điểm đích.
- Hiển thị quãng đường và thời gian di chuyển dự kiến.
- Liệt kê camera trong phạm vi khoảng 250 m quanh tuyến đường.
- Sắp xếp camera theo thứ tự di chuyển từ điểm xuất phát.
- Nhấn camera trong danh sách để di chuyển bản đồ và mở ảnh.

## Công nghệ

- React 18 và Vite 6.
- Leaflet và Leaflet MarkerCluster.
- OpenStreetMap cho dữ liệu bản đồ nền.
- Photon và Nominatim cho tìm kiếm địa điểm.
- OSRM cho tính toán tuyến đường ô tô.
- Nginx Alpine để phục vụ bản production trong Docker.

## Yêu cầu môi trường

### Chạy phát triển

- Node.js 20 trở lên. Khuyến nghị Node.js 22 LTS.
- npm đi kèm Node.js.

### Chạy bằng Docker

- Docker Engine 24 trở lên hoặc Docker Desktop phiên bản tương ứng.
- Trình duyệt hiện đại có hỗ trợ Geolocation API.

## Cài đặt và chạy phát triển

```bash
npm ci
npm run dev
```

Mặc định ứng dụng chạy tại:

```text
http://localhost:3000
```

Vite được cấu hình tự động mở trình duyệt. Có thể tắt tùy chọn `open` trong `vite.config.js` khi chạy trên máy chủ không có giao diện đồ họa.

## Build production không dùng Docker

```bash
npm ci
npm run build
```

Kết quả được tạo trong thư mục `dist`. Kiểm tra bản build bằng:

```bash
npm run preview
```

Không mở trực tiếp `dist/index.html` bằng giao thức `file://`. Hãy phục vụ thư mục `dist` qua HTTP server để các asset và `cameras.json` được tải đúng.

## Build Docker image

Dockerfile sử dụng multi-stage build:

1. Stage `build` dùng Node Alpine để cài dependency và build Vite.
2. Stage `runtime` chỉ chứa Nginx Alpine và file tĩnh trong `dist`.
3. `node_modules`, source build và công cụ Node.js không xuất hiện trong image cuối.

Build image:

```bash
docker build -t hcmc-traffic-camera:1.0.0 .
```

Chạy container:

```bash
docker run --rm -d \
  --name hcmc-traffic-camera \
  -p 8080:80 \
  hcmc-traffic-camera:1.0.0
```

Truy cập:

```text
http://localhost:8080
```

Kiểm tra trạng thái container:

```bash
docker inspect --format='{{json .State.Health}}' hcmc-traffic-camera
```

Kiểm tra health endpoint:

```bash
curl http://localhost:8080/healthz
```

Kết quả mong đợi:

```text
ok
```

Dừng container:

```bash
docker stop hcmc-traffic-camera
```

## Docker Compose tham khảo

```yaml
services:
  traffic-camera:
    build: .
    image: hcmc-traffic-camera:1.0.0
    container_name: hcmc-traffic-camera
    restart: unless-stopped
    ports:
      - "8080:80"
```

Khởi chạy:

```bash
docker compose up -d --build
```

## Cấu trúc chính

```text
.
|-- public/
|   `-- cameras.json          # Dữ liệu camera
|-- src/
|   |-- App.jsx               # Bản đồ và luồng nghiệp vụ chính
|   |-- components/           # Component giao diện
|   |-- context/              # Trạng thái camera
|   |-- hooks/                # React hooks dùng chung
|   `-- utils/                # Hàm tiện ích
|-- Dockerfile                # Multi-stage production image
|-- nginx.conf                # Nginx SPA, cache và healthcheck
|-- .dockerignore             # Giảm Docker build context
|-- package.json
`-- vite.config.js
```

## Dịch vụ bên ngoài

Ứng dụng chạy hoàn toàn phía trình duyệt và gọi trực tiếp các dịch vụ sau:

- `tile.openstreetmap.org`: tải bản đồ nền.
- `photon.komoot.io`: tìm kiếm địa điểm chính.
- `nominatim.openstreetmap.org`: tìm kiếm dự phòng.
- `router.project-osrm.org`: tính toán tuyến đường.
- `giaothong.hochiminhcity.gov.vn:8007`: ảnh camera giao thông.
- `camera.thongtingiaothong.vn`: một số nguồn ảnh camera cũ.
- `cdnjs.cloudflare.com`: icon mặc định của Leaflet.

Máy người dùng phải truy cập được các domain trên. Nếu triển khai sau firewall, cần cho phép kết nối HTTPS ra ngoài tới các dịch vụ này.

## Định vị người dùng

Trình duyệt chỉ cho phép truy cập vị trí trong secure context:

- `http://localhost` được chấp nhận khi phát triển.
- Môi trường production nên sử dụng HTTPS.
- Nếu truy cập bằng IP nội bộ qua HTTP, trình duyệt có thể từ chối Geolocation API.

Người dùng phải cấp quyền vị trí cho trình duyệt. Nếu quyền bị từ chối, họ vẫn có thể chọn chế độ **Nhập địa chỉ** cho nơi đi.

## Cấu hình Nginx

`nginx.conf` bao gồm:

- SPA fallback về `index.html`.
- Không cache `index.html` và `cameras.json`.
- Cache asset có hash trong `/assets/` trong một năm.
- Bật gzip cho HTML, CSS, JavaScript, JSON và SVG.
- Tắt hiển thị phiên bản Nginx.
- Thêm các HTTP security header cơ bản.
- Health endpoint tại `/healthz`.

Khi đặt container sau reverse proxy, reverse proxy nên chịu trách nhiệm cấp TLS/HTTPS và chuyển tiếp request tới cổng `80` của container.

## Cập nhật dữ liệu camera

Dữ liệu camera nằm tại `public/cameras.json`. Sau khi cập nhật file này, cần build lại ứng dụng hoặc Docker image:

```bash
docker build --no-cache -t hcmc-traffic-camera:1.0.1 .
```

Nginx được cấu hình không cache `cameras.json`, nhưng file mới chỉ xuất hiện trong container sau khi image được build và container được thay thế.

## Xử lý sự cố

### Không tải được ảnh camera

- Mở nút xem ảnh gốc để kiểm tra máy chủ camera còn hoạt động hay không.
- Kiểm tra trình duyệt hoặc firewall có chặn cổng `8007` hay không.
- Kiểm tra lỗi mixed content nếu website chạy HTTPS nhưng nguồn camera chỉ hỗ trợ HTTP.
- Thử tải lại trang bằng `Ctrl + F5` để bỏ cache cũ.

### Không lấy được vị trí hiện tại

- Kiểm tra quyền Location của trình duyệt.
- Dùng `localhost` khi phát triển hoặc HTTPS khi triển khai production.
- Kiểm tra GPS/Wi-Fi location service của thiết bị.

### Không tìm được địa chỉ hoặc tuyến đường

- Kiểm tra kết nối tới Photon, Nominatim và OSRM.
- Các endpoint công cộng có thể giới hạn tần suất hoặc tạm thời quá tải.
- Với nhu cầu production lớn, nên vận hành dịch vụ geocoding/routing riêng hoặc dùng nhà cung cấp có SLA.

### Container unhealthy

```bash
docker logs hcmc-traffic-camera
docker exec hcmc-traffic-camera wget -qO- http://127.0.0.1/healthz
```

Kiểm tra cổng host có bị ứng dụng khác sử dụng hay không. Có thể đổi sang cổng khác, ví dụ `-p 8081:80`.

## Kiểm tra trước khi phát hành

```bash
npm ci
npm run build
docker build -t hcmc-traffic-camera:test .
docker run --rm -d --name hcmc-traffic-camera-test -p 8080:80 hcmc-traffic-camera:test
curl --fail http://localhost:8080/healthz
```

Sau khi kiểm tra giao diện tại `http://localhost:8080`, dừng container:

```bash
docker stop hcmc-traffic-camera-test
```
