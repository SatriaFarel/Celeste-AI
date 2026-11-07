// Rate limit memory sederhana khusus runtime Vercel
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const ipCache = new Map();

export default async function handler(req, res) {
  // 1. Hanya izinkan metode POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metode HTTP tidak diizinkan." });
  }

  // 2. Proteksi Rate Limiting (Anti Spam)
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown_ip";

  const now = Date.now();
  const userRate = ipCache.get(clientIp) || { count: 0, startTime: now };

  // Reset window jika sudah lebih dari 1 menit
  if (now - userRate.startTime > RATE_LIMIT_WINDOW_MS) {
    userRate.count = 1;
    userRate.startTime = now;
  } else {
    userRate.count += 1;
  }
  ipCache.set(clientIp, userRate);

  // Bersihkan cache IP yang sudah kadaluarsa secara manual agar ram serverless hemat
  if (ipCache.size > 100) {
    for (const [ip, data] of ipCache.entries()) {
      if (now - data.startTime > RATE_LIMIT_WINDOW_MS) ipCache.delete(ip);
    }
  }

  if (userRate.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: "Terlalu banyak request. Tunggu 1 menit sebelum mengirim pesan lagi.",
    });
  }

  // 3. Ambil dan validasi payload dari body
  const { conversation, conservation } = req.body || {};
  const rawChatList = conversation || conservation;

  if (!Array.isArray(rawChatList) || rawChatList.length === 0) {
    return res.status(400).json({ error: "Riwayat percakapan tidak valid." });
  }

  try {
    // 4. Cek API Keys dari Environment Variable Vercel
    const API_KEYS = [
      process.env.MIMO_API_KEY,
      process.env.GEMINI_API_KEY,
      process.env.DEEPSEEK_API_KEY
    ].filter(key => typeof key === "string" && key.trim().length > 0);

    // Jika tidak ada API Key yang diset di Environment Vercel
    if (API_KEYS.length === 0) {
      console.error("[Vercel Error] Tidak ada API Key yang ditemukan di Environment Variables.");
      return res.status(500).json({
        error: "Konfigurasi server belum lengkap (API Key belum diisi di Vercel).",
      });
    }

    const BASE_URL = "https://bandelbanget.xyz/v1/chat/completions";
    const MODEL = "mimo-v2.5-pro";

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

    // Ambil 4 pesan terakhir
    const slicedChats = rawChatList.slice(-4);

    const formattedChats = slicedChats.map(({ role, text, image }, index) => {
      const isLatestMessage = index === slicedChats.length - 1;
      const parsedRole = role === "bot" || role === "model" ? "assistant" : "user";
      
      let trimmedText = text ? text.trim() : "";
      if (trimmedText.length > 1000 && !isLatestMessage) {
        trimmedText = trimmedText.slice(0, 1000) + "... [teks dipangkas]";
      }

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

      return { role: parsedRole, content: trimmedText };
    }).filter(msg => {
      if (Array.isArray(msg.content)) return msg.content.length > 0;
      return msg.content !== "";
    });

    const messages = [
      { role: "system", content: SYSTEM_INSTRUCTION },
      ...formattedChats
    ];

    let botReply = null;
    let lastErrorStatus = null;
    let lastErrorMessage = "";

    // 5. Perulangan Fallback API Key
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
            max_tokens: 800,
          }),
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          lastErrorStatus = apiResponse.status;
          lastErrorMessage = errorData?.error?.message || apiResponse.statusText;
          console.warn(`[Key Ke-${i + 1} Gagal] Status: ${lastErrorStatus} - ${lastErrorMessage}`);
          continue;
        }

        const data = await apiResponse.json();
        botReply = data?.choices?.[0]?.message?.content || "Tidak ada respon dari server.";
        break; // Sukses, keluar loop

      } catch (err) {
        console.error(`[Key Ke-${i + 1} Fetch Error]:`, err);
        lastErrorMessage = err?.message || "Gangguan koneksi API.";
      }
    }

    if (!botReply) {
      if (lastErrorStatus === 429) {
        return res.status(429).json({ error: "Batas kuota seluruh API Key telah tercapai. Silakan coba lagi nanti." });
      }
      return res.status(500).json({ error: `Gagal menghubungkan ke AI Service: ${lastErrorMessage}` });
    }

    return res.status(200).json({ result: botReply });

  } catch (e) {
    console.error("Fatal Handler Error:", e);
    return res.status(500).json({
      error: "Terjadi kesalahan internal pada server.",
    });
  }
}