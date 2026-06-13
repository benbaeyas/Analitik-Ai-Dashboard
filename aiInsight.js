// aiInsight.js — All AI communication goes through the local proxy server
// The API key is NEVER present in the browser.

async function callGroq(prompt, systemInstruction = "Anda adalah asisten AI ahli dalam analisis data.") {
  try {
    const response = await fetch(CONFIG.AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, systemInstruction })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Proxy Error:", errText);
      return "Maaf, terjadi kesalahan saat menghubungi AI: " + errText;
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Fetch error:", error);
    return "Gagal terhubung ke server AI.";
  }
}

// ── Single unified AI call ────────────────────────────────────
// Combines: title, SCR story, 3 insights, and anomaly narrative
// into ONE prompt → ONE API call → parsed into 4 sections.
async function getUnifiedAIResponse(summary, anomalies) {
  const prompt = `
Kamu adalah data analyst dan storyteller ahli.
Berdasarkan data ringkasan dan anomali penjualan berikut:

DATA RINGKASAN:
${JSON.stringify(summary, null, 2)}

ANOMALI YANG TERDETEKSI:
${JSON.stringify(anomalies, null, 2)}

PANDUAN KETAT NARASI (GUARDRAILS):
1. PENGGUNAAN DATA WAJIB (SANGAT PENTING): Seluruh deskripsi, cerita (SCR), dan insight WAJIB menyertakan angka/metrik spesifik dari data yang diberikan (seperti nominal Sales, persentase margin, nilai profit/rugi, atau Z-score) untuk memperkuat argumen. Jangan membuat pernyataan umum atau asumsi tanpa didukung angka faktual.
2. JIKA TERJADI KEBOCORAN MARGIN: Jika data menunjukkan produk/kategori dengan penjualan tinggi (Sales melonjak) tetapi Profit negatif, Anda WAJIB mengikuti panduan ini:
   - Pilihan Judul (pilih salah satu, mutlak):
     * "Erosi Margin: Volume Penjualan Meningkat di Tengah Tekanan Biaya Produk"
     * "Anomali Komoditas: Sub-Kategori Utama Mengalami Defisit Profitabilitas Akut"
     * "Skala Tanpa Profit: Evaluasi Diskon dan Beban Biaya Logistik Regional"
   - Sudut Pandang Cerita (SCR):
     * Setup: Tunjukkan performa toko secara omzet (Sales) tampak aman/tinggi (Sebutkan angka total sales/pertumbuhan).
     * Conflict: Soroti deteksi produk spesifik yang menguras kas karena margin negatif (WAJIB sebutkan nama produk, total kerugian, dan margin/Z-score).
     * Resolution: Berikan rekomendasi konkrit (seperti evaluasi diskon) berdasarkan metrik yang bocor tersebut.

Buatkan respon HANYA dalam format JSON yang valid (tanpa markdown tambahan seperti \`\`\`json).
Struktur JSON yang diharapkan:
{
  "judul": "Satu kalimat judul dashboard naratif, berbasis insight, dan berfokus pada anomali utama. Maks 12 kata. Tanpa tanda kutip.",
  "cerita": {
    "setup": "1-2 kalimat deskripsi situasi normal (Setup).",
    "conflict": "1-2 kalimat anomali atau masalah utama (Conflict).",
    "resolution": "1-2 kalimat rekomendasi atau solusi (Resolution)."
  },
  "insight": [
    "Tepat 3 insight utama, poin 1",
    "poin 2",
    "poin 3"
  ],
  "narasi_anomali": [
    "Rangkum anomali maks 3 poin. Poin 1",
    "Poin 2",
    "Poin 3"
  ]
}

Jawab seluruh teks di dalam JSON dalam Bahasa Indonesia.
  `.trim();

  const raw = await callGroq(prompt, "Anda adalah data analyst dan storyteller ahli. SELALU output dalam format JSON murni yang valid tanpa awalan atau akhiran apapun.");
  return parseUnifiedResponse(raw);
}

function parseUnifiedResponse(text) {
  try {
    // Bersihkan jika AI masih membandel memberikan markdown code blocks
    let cleanedText = text.trim();
    if (cleanedText.startsWith('\`\`\`json')) {
      cleanedText = cleanedText.substring(7);
    } else if (cleanedText.startsWith('\`\`\`')) {
      cleanedText = cleanedText.substring(3);
    }
    if (cleanedText.endsWith('\`\`\`')) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    
    const parsed = JSON.parse(cleanedText);
    
    return {
      title: parsed.judul || 'Dashboard Analisis Penjualan',
      story: {
        setup: parsed.cerita?.setup || 'Setup narasi tidak ditemukan.',
        conflict: parsed.cerita?.conflict || 'Conflict narasi tidak ditemukan.',
        resolution: parsed.cerita?.resolution || 'Resolution narasi tidak ditemukan.',
      },
      insight: Array.isArray(parsed.insight) ? parsed.insight.map(i => '• ' + i).join('<br>') : 'Tidak ada insight yang dihasilkan.',
      anomalyNarrative: Array.isArray(parsed.narasi_anomali) ? parsed.narasi_anomali.map(n => '• ' + n).join('<br>') : 'Tidak ada narasi anomali.',
    };
  } catch (err) {
    console.error("Gagal melakukan parse JSON dari AI:", err, "Raw response:", text);
    return {
      title: 'Dashboard Analisis Penjualan',
      story: { setup: 'Gagal memuat', conflict: 'Gagal memuat', resolution: 'Gagal memuat' },
      insight: 'Gagal memuat insight dari AI.',
      anomalyNarrative: 'Gagal memuat narasi anomali dari AI.'
    };
  }
}

// ── Standalone insight for custom questions ────────────────────
async function getInsight(summaryStats, customQuestion) {
  const prompt = `
Kamu adalah asisten analisis data khusus untuk dashboard penjualan ini.
Berikut adalah data ringkasan dashboard yang sedang ditampilkan:

DATA DASHBOARD:
${JSON.stringify(summaryStats, null, 2)}

PERTANYAAN USER:
"${customQuestion}"

ATURAN KETAT YANG HARUS DIIKUTI:
1. Kamu HANYA boleh menjawab pertanyaan yang berkaitan dengan data penjualan, grafik, metrik, tren, anomali, atau rekomendasi bisnis berdasarkan data di atas.
2. Jika pertanyaan TIDAK berkaitan dengan data dashboard (contoh: matematika umum, pengetahuan umum, coding, cuaca, dll), TOLAK dengan sopan dan arahkan kembali ke konteks dashboard.
3. Format penolakan jika di luar konteks: "Pertanyaan ini di luar konteks dashboard. Silakan tanyakan seputar data penjualan, grafik, atau metrik yang tersedia."
4. Jawaban harus selalu mengacu pada angka/metrik spesifik dari data yang diberikan jika relevan.
5. Jawab dalam Bahasa Indonesia.
  `.trim();

  const systemInstruction = `Kamu adalah asisten AI yang HANYA bertugas menganalisis data dashboard penjualan. 
Kamu TIDAK boleh menjawab pertanyaan di luar topik: data penjualan, profit, margin, tren, anomali, segmen, produk, wilayah, dan rekomendasi bisnis berbasis data.
Jika user bertanya hal lain (matematika, pengetahuan umum, hiburan, dll), tolak dengan sopan dan minta user untuk bertanya seputar data dashboard.
Selalu jawab dalam Bahasa Indonesia.`;

  return await callGroq(prompt, systemInstruction);
}
