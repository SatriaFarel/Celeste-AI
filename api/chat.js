// --- CONFIG & SECURITY CONSTANTS ---
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 Menit
const MAX_REQUESTS_PER_WINDOW = 6;       // Maksimal 6 request / IP / menit
const MAX_TEXT_LENGTH = 1500;            // Batas maksimal karakter input teks
const MAX_BASE64_SIZE_BYTES = 5 * 1024 * 1024; // Maksimal ukuran gambar ~5MB

const ipCache = new Map();

// Daftar White-list Model AI yang Diizinkan (Mencegah Arbitrary Model Injection)
const ALLOWED_MODELS = new Set([
  "mimo-v2.5-pro",
  "deepseek-v4.1-flash",
  "glm-5.3-flash",
  "kimi-k2.8"
]);

// Helper sanitasi teks sederhana
function sanitizeText(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "") // Hapus karakter kontrol tak terlihat
    .trim();
}

export default async function handler(req, res) {
  // 1. Keamanan Header & CORS Restriction
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // 2. Proteksi Metode HTTP
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metode HTTP tidak diizinkan." });
  }

  // 3. Robust IP Detection (Mencegah IP Spoofing via X-Forwarded-For)
  const rawIpHeader = req.headers["x-forwarded-for"];
  const clientIp = rawIpHeader
    ? rawIpHeader.split(",")[0].trim()
    : req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown_ip";

  // 4. In-Memory Rate Limiting (Mencegah DDoS & Spamting)
  const now = Date.now();
  const userRate = ipCache.get(clientIp) || { count: 0, startTime: now };

  if (now - userRate.startTime > RATE_LIMIT_WINDOW_MS) {
    userRate.count = 1;
    userRate.startTime = now;
  } else {
    userRate.count += 1;
  }
  ipCache.set(clientIp, userRate);

  // Auto-garbage collection cache memory
  if (ipCache.size > 200) {
    for (const [ip, data] of ipCache.entries()) {
      if (now - data.startTime > RATE_LIMIT_WINDOW_MS) ipCache.delete(ip);
    }
  }

  if (userRate.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: "Terlalu banyak permintaan dari IP Anda. Harap tunggu 1 menit.",
    });
  }

  // 5. Validasi Body Payload & Proteksi Ukuran Data
  const { conversation, conservation, model } = req.body || {};
  const rawChatList = conversation || conservation;

  if (!Array.isArray(rawChatList) || rawChatList.length === 0) {
    return res.status(400).json({ error: "Riwayat percakapan tidak valid." });
  }

  // Validasi Model (Whitelist Protection)
  const SELECTED_MODEL = ALLOWED_MODELS.has(model) ? model : "mimo-v2.5-pro";

  try {
    // 6. Cek Keberadaan API Key
    const API_KEYS = [
      process.env.MIMO_API_KEY,
      process.env.GEMINI_API_KEY
    ].filter(key => typeof key === "string" && key.trim().length > 0);

    if (API_KEYS.length === 0) {
      console.error("[Vercel Security Alert] API Key tidak ditemukan di environment.");
      return res.status(500).json({
        error: "Konfigurasi server belum lengkap.",
      });
    }

    const BASE_URL = "https://bandelbanget.xyz/v1/chat/completions";

    const SYSTEM_INSTRUCTION = `
Kamu adalah Celeste AI, seorang asisten belajar personal dan mentor edukasi virtual yang sangat berpengalaman, berwawasan luas, santai, dan bersahabat.

Identitas & Persona Celeste AI:
- Nama: Celeste AI.
- Model Mesin AI Saat Ini: ${SELECTED_MODEL}
- Peran: Teman diskusimu yang siap membantu memahami konsep pelajaran, logika coding, ilmu pengetahuan, hingga metode belajar efektif.
- Kepribadian: Sabar, suportif, komunikatif, dan cerdas.

Aturan Utama Penyampaian:
1. Bahasa: Gunakan Bahasa Indonesia yang natural, hangat, ramah, dan manusiawi.
2. Kesadaran Model: Jika pengguna bertanya model AI apa yang sedang kamu gunakan, jawab secara jujur dan ramah bahwa kamu sedang berjalan menggunakan mesin model **${SELECTED_MODEL}**.
3. Penjelasan Edukatif & Intuitif:
- Jelaskan konsep rumit dengan analogi dunia nyata yang sederhana dan mudah dipahami.
- Hindari bahasa akademis yang terlalu kaku atau berbelit-belit.
- Hindari penggunaan emoji atau dekorasi berlebihan yang mengganggu keterbacaan.
4. Format Markdown Clean:
- Gunakan cetak tebal (bold) dan daftar poin (bullet points) seperlunya untuk memudahkan pembaca menelaah poin penting.
- Untuk contoh kode, selalu sertakan code block yang rapi beserta penjelasan singkat per bagian pentingnya.
5. Mode Kuis / Latihan Soal (Reaktif):
- JANGAN memberikan kuis/soal secara spontan kecuali pengguna yang memintanya secara eksplisit.
- Jika pengguna meminta latihan soal, berikan 1-2 soal terlebih dahulu, lalu tunggu jawaban pengguna sebelum memberikan kunci pembahasan.
6. Guardrail Keamanan & Etika:
   - TOLAK dengan sopan semua permintaan yang berkaitan dengan hacking ilegal, malware, eksploitasi celah keamanan (cyberattack), konten pornografi/kebencian, ujaran kebencian, kecurangan akademik berat (seperti pembuatan virus/ransomware), serta instruksi membahayakan diri sendiri atau orang lain.
`;

    // 7. Sanitasi, Trim & Validasi Ukuran Chat (Mencegah RAM Overflow / Cost Attack)
    const slicedChats = rawChatList.slice(-4); // Batasi hanya 4 percakapan terakhir

    const formattedChats = slicedChats.map(({ role, text, image }, index) => {
      const isLatestMessage = index === slicedChats.length - 1;
      const parsedRole = role === "bot" || role === "model" ? "assistant" : "user";

      let cleanText = sanitizeText(text);

      // Batasi panjang teks pesan
      if (cleanText.length > MAX_TEXT_LENGTH) {
        cleanText = cleanText.slice(0, MAX_TEXT_LENGTH) + "... [teks dipangkas demi keamanan]";
      }

      // Validasi & Proteksi Upload Gambar (Hanya untuk pesan paling baru)
      if (isLatestMessage && image?.data && image?.mimeType) {
        // Cek tipe MIME gambar yang aman
        const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedMimeTypes.includes(image.mimeType)) {
          return { role: parsedRole, content: cleanText };
        }

        // Cek estimasi ukuran Base64
        const estimatedSizeBytes = (image.data.length * 3) / 4;
        if (estimatedSizeBytes > MAX_BASE64_SIZE_BYTES) {
          return { role: parsedRole, content: cleanText + "\n[Gambar ditolak: Ukuran melebihi batas 5MB]" };
        }

        const contentArray = [];
        if (cleanText) {
          contentArray.push({ type: "text", text: cleanText });
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

      return { role: parsedRole, content: cleanText };
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

    // 8. Fallback Multi API Key dengan Timeout Abort (Mencegah Server Hanged)
    for (let i = 0; i < API_KEYS.length; i++) {
      const currentApiKey = API_KEYS[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 detik timeout

      try {
        const apiResponse = await fetch(BASE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${currentApiKey}`,
          },
          body: JSON.stringify({
            model: SELECTED_MODEL,
            messages: messages,
            temperature: 0.6,
            max_tokens: 800,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          lastErrorStatus = apiResponse.status;
          lastErrorMessage = errorData?.error?.message || apiResponse.statusText;
          console.warn(`[Key Ke-${i + 1} Gagal] Status: ${lastErrorStatus} | ${lastErrorMessage}`);
          continue;
        }

        const data = await apiResponse.json();
        botReply = data?.choices?.[0]?.message?.content || "Tidak ada respon dari server.";
        break;

      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.error(`[Key Ke-${i + 1}] Request Timeout (>15s)`);
          lastErrorMessage = "Waktu tunggu server habis.";
        } else {
          console.error(`[Key Ke-${i + 1} Fetch Error]:`, err);
          lastErrorMessage = err?.message || "Gangguan koneksi API.";
        }
      }
    }

    if (!botReply) {
      if (lastErrorStatus === 429) {
        return res.status(429).json({ error: "Batas kuota API server telah tercapai. Coba beberapa saat lagi." });
      }
      return res.status(500).json({ error: `Gagal memproses ke AI Service: ${lastErrorMessage}` });
    }

    return res.status(200).json({ result: botReply });

  } catch (e) {
    console.error("Fatal Handler Error:", e);
    return res.status(500).json({
      error: "Terjadi kesalahan internal pada server.",
    });
  }
}