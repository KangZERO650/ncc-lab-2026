# Serial Web Telemetry — Static Site with Nginx

## Informasi Proyek

Proyek ini adalah deployment **static web application** menggunakan **Nginx** sebagai web server sekaligus *reverse proxy*, yang dijalankan di dalam container Docker. Proyek ini berbasis Native HTML, Native CSS dan Native JS serta mendukung **Web Serial API**.

---

## 1. Arsitektur Sistem

Sistem ini menggunakan arsitektur sederhana berbasis **single container** dengan Nginx sebagai satu-satunya service:

```
Internet (URL: https://serial-web.kero.my.id)
       │
       ▼
 ┌──────────────────────────────┐
 │    NPM (Nginx Proxy Manager) │  ← Proxy Server milik VPS
 │  (Proxy Server VPS)          │  ← Membuat web terekspos ke internet
 └──────────────────────────────┘
       │
Localhost VPS (Port 7777)
       │
       ▼
 ┌─────────────┐
 │    Nginx    │  ← Web server + Reverse Proxy
 │  (alpine)   │  ← Melayani static files dari /html
 └─────────────┘
       │
  Docker Network: serial-web-network (bridge)
```

- **Nginx** menerima request dari VPS melalui port `7777` yang di-*map* ke port `80` internal container.
- Static file disajikan dari direktori `./html` yang di-*mount* sebagai volume.
- Log Nginx disimpan di direktori `./logs` di host.

---

## 2. Implementasi Service

### 2.1 Nginx sebagai Web Server (`nginx.conf`)

Nginx dikonfigurasi dengan beberapa fitur utama:

- **Static File Serving**: Melayani file dari `/usr/share/nginx/html` dengan fallback ke `index.html`.
- **Gzip Compression**: Mengompresi response untuk tipe konten umum (HTML, CSS, JS, JSON, SVG, dll.) dengan level kompresi 6.
- **Cache Control**: Aset statis (JS, CSS, gambar, font) di-cache selama 1 tahun dengan header `immutable`. Karena project ini ga akan diperbarui lagi.
- **Security Headers**: Menambahkan header keamanan standar:
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: no-referrer-when-downgrade`
- **Web Serial API Support**: Header `Permissions-Policy: serial=(self)` diaktifkan untuk mendukung Web Serial API di browser.
- **Custom Error Pages**: Halaman error kustom untuk 404 dan 5xx.

### 2.2 Health Check Endpoint (`/health`)

Nginx menyediakan endpoint `/health` yang mengembalikan respons JSON:

```json
{"status": "ok"}
```

Endpoint ini tidak dicatat di access log (`access_log off`) untuk mengurangi noise pada log produksi.

### 2.3 Docker Compose & Container Configuration (`docker-compose.yml`)

- **Image Ringan**: Menggunakan `nginx:alpine` untuk meminimalisir ukuran image.
- **Restart Policy**: `restart: unless-stopped` agar service otomatis bangkit kembali saat VM di-*reboot* atau terjadi crash.
- **Port Configuration**: Hanya port `7777` yang di-*expose* ke host, dipetakan ke port `80` internal Nginx.
- **Volume Mounts**:
  - `./nginx.conf` → konfigurasi Nginx (read-only)
  - `./html` → direktori static files (read-only)
  - `./logs` → penyimpanan log Nginx di host
- **HEALTHCHECK**: Container dipantau secara berkala setiap 30 detik menggunakan `wget` ke endpoint `/health`, dengan timeout 10 detik dan 3 kali percobaan ulang.
- **Isolated Network**: Container berjalan dalam jaringan `serial-web-network` (bridge) yang terisolasi.

### 2.4 Optimasi Build Context (`.dockerignore`)

File `.dockerignore` mengecualikan file-file yang tidak diperlukan saat build:

```
.git
.gitignore
*.md
*.log
logs/
backups/
.env
.DS_Store
Thumbs.db
```

Hal ini mempercepat proses build dan menjaga *build context* tetap ringan serta mencegah file sensitif (seperti `.env`) masuk ke dalam image.

---

## 3. Struktur Direktori

```
.
├── nginx.conf          # Konfigurasi Nginx
├── docker-compose.yml  # Orkestrasi container
├── .dockerignore       # Eksklusif build context
├── html/               # Static files (index.html, aset, dll.)
└── logs/               # Log Nginx (di-generate saat runtime)
```

---

## 4. Cara Menjalankan

### Prasyarat

- Docker & Docker Compose sudah terinstal di mesin/VPS.

### Langkah Eksekusi

1. **Clone repository**:
   ```bash
   git clone <url-repository>
   cd <nama-folder>
   ```

2. **Pastikan direktori `html/` sudah berisi static files** (minimal `index.html`).

3. **Jalankan service**:
   ```bash
   docker compose up -d
   ```

4. **Verifikasi service berjalan**:
   ```bash
   curl https://serial-web.kero.my.id/health
   # Output: {"status" : "ok"}
   ```

5. **Cek status container**:
   ```bash
   docker compose ps
   docker inspect --format='{{.State.Health.Status}}' serial-web-nginx
   ```

6. **Melihat log**:
   ```bash
   # di VPS (host)
   cat logs/access.log
   ```

7. **Menghentikan service**:
   ```bash
   docker compose down
   ```

---

## 5. Konfigurasi Port

| Service | Port Host (VPS) | Port Container | Keterangan   |
| ------- | --------------- | -------------- | ----------   |
| Nginx   | 7777            | 80             | HTTP, publik |

> Project ini expected user untuk menggunakan reverse proxy eksternal (misalnya Nginx di VPS), arahkan ke port `7777` dan handle SSL/TLS di sana.

---

## 6. Catatan Tambahan

- Untuk mengubah port, ganti bagian `"7777:80"` pada `docker-compose.yml` sesuai kebutuhan.
- Web Serial API hanya berfungsi di browser yang mendukung dan pada konteks **HTTPS** atau `localhost`. Pastikan deployment production menggunakan HTTPS.
- Project ini expected untuk diletakkan dibelakang reverse proxy. Dan reverse proxy server yang akan menghandle SSL/TLS.
- Log Nginx tersimpan di `./logs/access.log` dan `./logs/error.log` di host (VPS) sehingga tetap persisten meski container di-restart.
