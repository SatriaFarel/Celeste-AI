🤖 Gemini AI Chatbot App

Aplikasi chatbot AI web modern yang menggunakan SDK Google GenAI (@google/genai) berbasis Node.js/Express di backend dan Vanilla JS + Tailwind CSS di frontend.

Proyek ini dirancang sebagai arsitektur sederhana namun aman untuk mengintegrasikan LLM Gemini ke aplikasi web tanpa membocorkan API Key di sisi klien.

✨ Fitur Utama

Percakapan Kontekstual (Multi-Turn): Mengingat riwayat percakapan sebelumnya dalam satu sesi chat.

Dukungan Dark & Light Mode: Peralihan tema gelap/terang secara instan dengan indikator preferensi sistem.

Desain Responsif: Antarmuka bersih dan ringan yang nyaman diakses lewat perangkat seluler maupun desktop.

Aman (Backend Proxy): Kunci API Gemini disimpan rapat di variabel lingkungan server (.env).

Siap Deploy ke Vercel: Dilengkapi konfigurasi Serverless Function (vercel.json).

🛠️ Teknologi & Stack

Backend: Node.js, Express.js

AI SDK: @google/genai (Gemini API)

Frontend: HTML5, Tailwind CSS (CDN), Javascript (ES6+)

Environment: dotenv, cors

🚀 Cara Menjalankan di Lokal

Ikuti langkah-langkah berikut untuk menjalankan proyek di komputer lokal kamu:

1. Prasyarat

Pastikan kamu sudah menginstal:

Node.js (Versi 18 atau lebih baru)

Kunci API Gemini dari Google AI Studio

2. Kloning & Install Dependencies

Buka terminal dan jalankan perintah berikut:

# Kloning repository

git clone https://github.com/username-kamu/gemini-chat-bot.git

# Masuk ke folder proyek

cd gemini-chat-bot

# Install seluruh dependensi

npm install

3. Konfigurasi Environment Variable

Buat file .env di root direktori proyek dengan mencontoh file .env.example:

cp .env.example .env

Buka file .env dan masukkan GEMINI_API_KEY milikmu:

GEMINI_API_KEY=AIzaSyYourActualApiKeyHere...
PORT=3000

4. Jalankan Aplikasi

Jalankan server lokal menggunakan perintah:

npm start

Jika berhasil, buka browser kamu dan akses alamat:
👉 http://localhost:3000

📡 API Endpoints Internal

Method

Endpoint

Deskripsi

POST

/api/chat

Mengirim array riwayat percakapan ke model Gemini dan mengembalikan respon teks.

Contoh Payload Request (POST /api/chat):

{
"conversation": [
{ "role": "user", "text": "Halo, siapa namamu?" }
]
}

☁️ Deploy ke Vercel

Proyek ini sudah dilengkapi file vercel.json sehingga dapat langsung dideploy ke platform Vercel:

Push kode kamu ke GitHub.

Buka Vercel Dashboard dan buat New Project.

Hubungkan ke repository GitHub proyek ini.

Pada menu Environment Variables, tambahkan:

Key: GEMINI_API_KEY

Value: (Isi dengan API Key Gemini kamu)

Klik Deploy.

📄 Lisensi

Proyek ini berlisensi MIT. Silakan gunakan dan kembangkan sesuai kebutuhan.
