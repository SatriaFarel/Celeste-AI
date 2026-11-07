// Rate Limiter Sederhana di In-Memory (Server/Instance level)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 Menit
const MAX_REQUESTS_PER_WINDOW = 10; // Batas 10 request per menit per IP
const ipCache = new Map();

// Helper untuk membersihkan cache tua agar tidak bocor memori
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipCache.entries()) {
    if (now - data.startTime > RATE_LIMIT_WINDOW_MS) {
      ipCache.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

export default async function handlerChat(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metode HTTP tidak diizinkan." });
  }

  // --- 1. RATE LIMITING (RPM Protection) ---
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
      error: "Terlalu banyak request (Rate limit tercapai). Tunggu 1 menit sebelum mengirim pesan lagi.",
    });
  }

  const { conversation, conservation } = req.body || {};
  const rawChatList = conversation || conservation;

  try {
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    const BASE_URL = "https://bandelbanget.xyz/v1/chat/completions";
    const MODEL = "mimo-v2.5-pro";

    // Optimasi System Instruction khusus Celeste AI
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

    if (!Array.isArray(rawChatList) || rawChatList.length === 0) {
      return res.status(400).json({ error: "Riwayat percakapan tidak valid." });
    }

    // --- 2. OPTIMASI INPUT TOKEN (TRUNCATE & PRUNING) ---
    // Diatur ke 4 pesan terakhir (2 pasang percakapan). Cukup untuk konteks aktif tanpa membengkakkan token.
    const slicedChats = rawChatList.slice(-4);

    const formattedChats = slicedChats.map(({ role, text, image }, index) => {
      const isLatestMessage = index === slicedChats.length - 1;
      const parsedRole = role === "bot" || role === "model" ? "assistant" : "user";
      
      // Pangkas teks yang terlalu panjang di pesan riwayat lama (max 1000 karakter per pesan)
      let trimmedText = text ? text.trim() : "";
      if (trimmedText.length > 1000 && !isLatestMessage) {
        trimmedText = trimmedText.slice(0, 1000) + "... [teks dipangkas]";
      }

      // Kirim gambar HANYA jika berada pada pesan terbawah/paling baru
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

        return {
          role: parsedRole,
          content: contentArray,
        };
      }

      return {
        role: parsedRole,
        content: trimmedText,
      };
    }).filter(msg => {
      if (Array.isArray(msg.content)) return msg.content.length > 0;
      return msg.content !== "";
    });

    const messages = [
      {
        role: "system",
        content: SYSTEM_INSTRUCTION,
      },
      ...formattedChats
    ];

    // --- 3. OPTIMASI REQUEST API & OUTPUT TOKEN ---
    const apiResponse = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        temperature: 0.6,
        max_tokens: 800, // Batasi jumlah karakter balasan AI agar tidak membengkak berlebihan
      }),
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({}));
      throw { status: apiResponse.status, message: errorData?.error?.message || apiResponse.statusText };
    }

    const data = await apiResponse.json();
    const botReply = data?.choices?.[0]?.message?.content || "Tidak ada respon dari server.";

    return res.status(200).json({ result: botReply });

  } catch (e) {
    console.error("API Error:", e);

    const isRateLimit = e?.status === 429 || e?.message?.includes("429") || e?.message?.includes("quota");
    if (isRateLimit) {
      return res.status(429).json({
        error: "Batas kuota tercapai. Silakan tunggu 1-2 menit sebelum mengirim pesan lagi.",
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