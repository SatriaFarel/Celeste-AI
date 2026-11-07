// Mencegah spam dengan membatasi request per IP address
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // Jangka waktu: 1 menit (60.000 ms)
const MAX_REQUESTS_PER_WINDOW = 10;     // Maksimal 10 request per menit per pengguna
const ipCache = new Map();              // Tempat menyimpan catatan jumlah request per IP

// Fitur otomatis: Membersihkan data IP lama dari memori setiap 1 menit
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipCache.entries()) {
    if (now - data.startTime > RATE_LIMIT_WINDOW_MS) {
      ipCache.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

export default async function handlerChat(req, res) {
  // Hanya menerima metode HTTP POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metode HTTP tidak diizinkan." });
  }

  // --- CEK RATE LIMIT (PEMBATAS SPAM) ---
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown_ip";
  const now = Date.now();
  const userRate = ipCache.get(clientIp) || { count: 0, startTime: now };

  if (now - userRate.startTime > RATE_LIMIT_WINDOW_MS) {
    userRate.count = 1;
    userRate.startTime = now;
  } else {
    userRate.count += 1;
  }
  ipCache.set(clientIp, userRate);

  if (userRate.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: "Terlalu banyak request. Tunggu 1 menit sebelum mengirim pesan lagi.",
    });
  }

  // --- AMBIL DATA DARI FRONTEND ---
  const { conversation, conservation } = req.body || {};
  const rawChatList = conversation || conservation;

  if (!Array.isArray(rawChatList) || rawChatList.length === 0) {
    return res.status(400).json({ error: "Riwayat percakapan tidak valid." });
  }

  try {
    // Menyusun daftar API Key. Jika Kunci 1 habis/error, otomatis pindah ke Kunci 2
    const API_KEYS = [
      process.env.MIMO_API_KEY, process.env.GEMINI_API_KEY
    ].filter(Boolean); // Menghapus key yang bernilai kosong/undefined

    const BASE_URL = "https://bandelbanget.xyz/v1/chat/completions";
    const MODEL = "mimo-v2.5-pro";

    // Persona dan aturan respon untuk Celeste AI
    const SYSTEM_INSTRUCTION = `
Kamu adalah Celeste AI, seorang asisten belajar personal dan mentor edukasi virtual yang sangat berpengalaman, berwawasan luas, santai, dan bersahabat.

Identitas & Persona Celeste AI:
- Nama: Celeste AI.
- Peran: Teman diskusimu yang siap membantu memahami konsep pelajaran, logika coding (HTML, CSS, JS, Backend, dll.), ilmu pengetahuan, hingga metode belajar efektif.
- Kepribadian: Sabar, suportif, komunikatif, dan cerdas. Kamu menyampaikan penjelasan seperti seorang senior/mentor yang asyik diajak berdiskusi.

Aturan Utama Penyampaian:
1. Bahasa: Gunakan Bahasa Indonesia yang natural, hangat, ramah, dan manusiawi.
2. Penjelasan Edukatif & Intuitif:
- Jelaskan konsep rumit dengan analogi dunia nyata yang sederhana dan mudah dipahami.
- Hindari bahasa akademis yang terlalu kaku atau berbelit-belit.
- Hindari penggunaan emoji atau dekorasi berlebihan yang mengganggu keterbacaan.
3. Format Markdown Clean:
- Gunakan cetak tebal (bold) dan daftar poin (bullet points) seperlunya untuk memudahkan pembaca menelaah poin penting.
- Untuk contoh kode, selalu sertakan code block yang rapi beserta penjelasan singkat per bagian pentingnya.
4. Mode Kuis / Latihan Soal (Reaktif):
- JANGAN memberikan kuis/soal secara spontan kecuali pengguna yang memintanya secara eksplisit.
- Jika pengguna meminta latihan soal, berikan 1-2 soal terlebih dahulu, lalu tunggu jawaban pengguna sebelum memberikan kunci pembahasan.
`;

    // Hanya ambil 4 pesan terakhir (2 pasang obrolan) untuk menghemat token
    const slicedChats = rawChatList.slice(-4);

    const formattedChats = slicedChats.map(({ role, text, image }, index) => {
      const isLatestMessage = index === slicedChats.length - 1;
      const parsedRole = role === "bot" || role === "model" ? "assistant" : "user";
      
      // Pangkas teks riwayat lama jika melebihi 1000 karakter
      let trimmedText = text ? text.trim() : "";
      if (trimmedText.length > 1000 && !isLatestMessage) {
        trimmedText = trimmedText.slice(0, 1000) + "... [teks dipangkas]";
      }

      // Jika pesan paling baru menyertakan gambar (Format Multimodal / Vision)
      if (isLatestMessage && image?.data && image?.mimeType) {
        const contentArray = [];

        if (trimmedText) {
          contentArray.push({ type: "text", text: trimmedText });
        }

        const imageUrl = image.data.startsWith("data:")
          ? image.data
          : `data:${image.mimeType};base64,${image.data}`;

        contentArray.push({
          type: "image_url",
          image_url: { url: imageUrl }
        });

        return { role: parsedRole, content: contentArray };
      }

      // Pesan teks biasa
      return { role: parsedRole, content: trimmedText };
    }).filter(msg => {
      if (Array.isArray(msg.content)) return msg.content.length > 0;
      return msg.content !== "";
    });

    // Gabungkan System Instruction di awal array pesan
    const messages = [
      { role: "system", content: SYSTEM_INSTRUCTION },
      ...formattedChats
    ];

    let botReply = null;
    let lastError = null;

    // Mencoba satu per satu API Key yang tersedia
    for (let i = 0; i < API_KEYS.length; i++) {
      const currentApiKey = API_KEYS[i];

      try {
        const apiResponse = await fetch(BASE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${currentApiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: messages,
            temperature: 0.6,
            max_tokens: 800, // Batas panjang balasan AI agar irit token
          }),
        });

        // Jika API Key ini bermasalah (error/limit), cetak log dan coba key berikutnya
        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          const status = apiResponse.status;
          console.warn(`[Key Ke-${i + 1} Gagal] Status: ${status}`);
          lastError = { status, message: errorData?.error?.message || apiResponse.statusText };
          continue; // Lanjut ke perulangan berikutnya
        }

        // Jika sukses
        const data = await apiResponse.json();
        botReply = data?.choices?.[0]?.message?.content || "Tidak ada respon dari server.";
        break; // Hentikan perulangan karena sudah berhasil

      } catch (err) {
        console.error(`[Key Ke-${i + 1} Network Error]:`, err);
        lastError = err;
      }
    }

    // Jika seluruh API Key gagal
    if (!botReply) {
      throw lastError || new Error("Semua API Key gagal memproses permintaan.");
    }

    // Kirim hasil balasan AI ke frontend
    return res.status(200).json({ result: botReply });

  } catch (e) {
    console.error("API Error Final:", e);

    // Penanganan pesan kesalahan (Error Handling)
    const isRateLimit = e?.status === 429 || e?.message?.includes("429") || e?.message?.includes("quota");
    if (isRateLimit) {
      return res.status(429).json({
        error: "Batas kuota seluruh API Key tercapai. Silakan tunggu 1-2 menit.",
      });
    }

    const isHighDemand = e?.status === 503 || e?.status === 502 || e?.message?.includes("503");
    if (isHighDemand) {
      return res.status(503).json({
        error: "Server sedang mengalami lonjakan trafik. Silakan coba kirim ulang.",
      });
    }

    return res.status(500).json({
      error: "Terjadi kendala teknis pada server. Silakan coba lagi.",
    });
  }
}