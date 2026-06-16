# AI-Augmented Sales Dashboard

Dashboard analisis penjualan yang diperkuat dengan AI untuk menghasilkan insight otomatis, deteksi anomali, dan narasi data berbasis storytelling (SCR Framework).

![Tampilan Dashboard](Tampilan%20Dashboard.png)

## Dataset

Dashboard ini menggunakan dataset **Sales by Category** yang berisi transaksi penjualan retail dengan kolom-kolom berikut:

| Kolom | Deskripsi |
|-------|-----------|
| SalesOrderID | ID unik transaksi |
| OrderDate / ShipDate | Tanggal order dan pengiriman |
| ShipMethod | Metode pengiriman (e.g. CARGO TRANSPORT 5) |
| Customer | ID, nama, dan segment pelanggan (Shop, etc.) |
| Lokasi | Country, City, Province, PostalCode, Territory |
| Produk | ProductName, SubCategory, Category |
| Finansial | Qty, UnitPrice, Sales, Discount, ProductCost, TotalCost, Profit (USD) |

Data mencakup transaksi dari berbagai territory (Southeast, Northwest, Canada, dll.) dengan kategori produk seperti Bikes, Clothing, dan Accessories. Semua nilai finansial dalam USD.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | HTML5, CSS3 (Custom Properties), Vanilla JavaScript |
| Visualisasi | D3.js v7, Tableau Public (embedded) |
| AI Engine | Groq API (LLaMA 3.3 70B Versatile) |
| Backend/Proxy | Node.js (native HTTP server) |
| Deployment | Netlify (Serverless Functions) |
| Font | Geist, Geist Mono |

## Fitur Utama

- **AI-Generated Narrative** — Judul, cerita (Setup-Conflict-Resolution), dan insight dihasilkan otomatis oleh AI berdasarkan data aktual
- **Anomaly Detection** — Deteksi otomatis menggunakan Z-score pada profit dan sales per sub-kategori
- **Interactive AI Chat** — Tanya jawab langsung dengan AI tentang data dashboard, dilengkapi session-based chat memory (konteks percakapan tersimpan selama tab aktif)
- **Suggested Prompts** — Prompt chips yang bisa diklik langsung untuk pertanyaan umum
- **D3.js Visualizations** — Chart interaktif: trend line, scatter plot, bar chart (territory, segment, sub-category)
- **Tableau Integration** — Embedded Tableau Public dashboard untuk eksplorasi visual tambahan
- **Animated Favicon** — Canvas-based animated chart icon di browser tab
- **Responsive Design** — Layout adaptif dengan design system monokrom (paper-ink aesthetic)

## Arsitektur API

```
Browser (Frontend)
    │
    │  POST /api/ai
    │  Body: { prompt, systemInstruction }
    │
    ▼
┌─────────────────────────┐
│   Proxy Server          │
│   (server.js / Netlify  │
│    Serverless Function)  │
└─────────────┬───────────┘
              │
              │  POST https://api.groq.com/openai/v1/chat/completions
              │  Header: Authorization: Bearer $GROQ_API_KEY
              │
              ▼
┌─────────────────────────┐
│   Groq API              │
│   Model: llama-3.3-70b  │
│          -versatile     │
└─────────────────────────┘
```

### Model

- **Provider:** Groq (inference engine)
- **Model:** `llama-3.3-70b-versatile` (Meta LLaMA 3.3, 70 billion parameters)
- **Use case:** Analisis data penjualan, storytelling naratif, deteksi pola, dan rekomendasi bisnis

### Keamanan API

| Aspek | Implementasi |
|-------|-------------|
| API Key Storage | Disimpan di environment variable server-side (`.env`), tidak pernah terekspos ke browser |
| Proxy Pattern | Frontend hanya berkomunikasi ke `/api/ai` (same-origin), server yang meneruskan ke Groq API |
| Client-side | Tidak ada secret/key di kode frontend — `config.js` hanya berisi endpoint path |
| Netlify Deploy | API key dikonfigurasi via Netlify Environment Variables (dashboard settings) |
| Input Scope | AI dibatasi hanya menjawab pertanyaan terkait data penjualan dashboard (system instruction enforcement) |

## Menjalankan Lokal

```bash
# 1. Clone repository
git clone <repo-url>

# 2. Buat file .env
echo "GROQ_API_KEY=your_api_key_here" > .env

# 3. Install dependencies
npm install

# 4. Jalankan server
npm start
# Server berjalan di http://localhost:3000
```

## Author

Andreas Benaya
