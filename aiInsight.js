// aiInsight.js — All AI communication goes through the local proxy server
// The API key is NEVER present in the browser.

// Session-level chat history (hilang saat tab di-refresh)
const chatSessionHistory = [];

async function callGroq(prompt, systemInstruction = "Anda adalah asisten AI ahli dalam analisis data.", { useHistory = false } = {}) {
  try {
    let finalPrompt = prompt;

    if (useHistory && chatSessionHistory.length > 0) {
      const historyText = chatSessionHistory.map(msg => {
        const label = msg.role === 'user' ? 'User' : 'Assistant';
        return `${label}: ${msg.content}`;
      }).join('\n');
      finalPrompt = `RIWAYAT PERCAKAPAN SEBELUMNYA:\n${historyText}\n\nPERTANYAAN BARU:\n${prompt}`;
    }

    const body = JSON.stringify({ prompt: finalPrompt, systemInstruction });

    const response = await fetch(CONFIG.AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Proxy Error:", errText);
      return "Maaf, terjadi kesalahan saat menghubungi AI: " + errText;
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    if (useHistory && reply) {
      chatSessionHistory.push({ role: 'user', content: prompt });
      chatSessionHistory.push({ role: 'assistant', content: reply });
      while (chatSessionHistory.length > 20) {
        chatSessionHistory.shift();
      }
    }

    return reply;
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

PENTING: Semua nilai Sales, Profit, dan biaya dalam data ini adalah dalam mata uang USD (Dolar Amerika). 
Gunakan format "$1,234" atau "USD 1,234" saat menyebutkan angka dalam narasi. JANGAN gunakan Rupiah atau IDR.

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

// ── Standalone insight for custom questions (with session history) ──
async function getInsight(richContext, customQuestion) {
  const prompt = `
Kamu adalah asisten analisis data khusus untuk dashboard penjualan ini.
Berikut adalah data lengkap dashboard yang sedang ditampilkan, termasuk breakdown per wilayah, segmen, sub-kategori, kategori, dan produk:

PENTING: Semua nilai Sales, Profit, dan biaya dalam data ini adalah dalam mata uang USD (Dolar Amerika).
Gunakan format "$1,234" atau "USD 1,234" saat menyebutkan angka. JANGAN gunakan Rupiah atau IDR.

DATA LENGKAP DASHBOARD:
${JSON.stringify(richContext, null, 2)}

PERTANYAAN USER:
"${customQuestion}"

ATURAN KETAT YANG HARUS DIIKUTI:
1. Gunakan data breakdown di atas untuk menjawab pertanyaan spesifik seperti "profit Australia", "segment mana paling rugi", "produk terbaik", dll. Data per wilayah ada di "by_territory", per segmen di "by_segment", per sub-kategori di "by_subcat", per produk di "by_product_top15".
2. JIKA pengguna meminta rekomendasi, saran bisnis, insight strategi, atau menanyakan "Mengapa" dan "Bagaimana" terkait sales/profit/diskon, BERIKAN JAWABAN ANALITIS YANG MENDALAM berbasis data di atas.
3. Pertanyaan singkat seperti "Masalah region?", "Rekomendasi?", atau "Prioritas profit?" ADALAH pertanyaan bisnis yang valid — WAJIB dijawab berdasarkan data.
4. Jika pertanyaan BENAR-BENAR tidak berkaitan dengan data dashboard (matematika umum, pengetahuan umum, coding, cuaca, dll), tolak dengan sopan: "Maaf, kemampuan saya dibatasi khusus untuk menganalisis data penjualan dan memberikan rekomendasi bisnis pada dashboard ini saja."
5. Jawaban harus selalu menyebut angka/metrik spesifik dari data yang diberikan.
6. Jawab dalam Bahasa Indonesia.
7. Jika ada konteks percakapan sebelumnya, gunakan itu untuk memberikan jawaban yang lebih relevan dan koheren.
  `.trim();

  const systemInstruction = `Kamu adalah asisten AI yang HANYA bertugas menganalisis data dashboard penjualan.
Data yang kamu terima mencakup breakdown per wilayah (Territory), segmen, sub-kategori, kategori, dan produk.
Gunakan data breakdown tersebut untuk menjawab pertanyaan spesifik tentang wilayah, produk, atau segmen tertentu.
Kamu TIDAK boleh menjawab pertanyaan di luar topik: data penjualan, profit, margin, tren, anomali, segmen, produk, wilayah, dan rekomendasi bisnis berbasis data.
Selalu jawab dalam Bahasa Indonesia dengan menyebut angka USD spesifik dari data.
Kamu memiliki akses ke riwayat percakapan sebelumnya dalam sesi ini. Gunakan konteks tersebut untuk menjawab pertanyaan lanjutan.`;

  return await callGroq(prompt, systemInstruction, { useHistory: true });
}
