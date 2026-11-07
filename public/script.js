// --- Configuration Constants ---
const STORAGE_KEY = 'app_chat_session_v1';
const THEME_KEY = 'app_theme_mode';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds

// --- DOM Elements ---
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const sendBtn = document.getElementById("send-btn");
const themeToggleBtn = document.getElementById("theme-toggle");
const darkIcon = document.getElementById("theme-toggle-dark-icon");
const lightIcon = document.getElementById("theme-toggle-light-icon");
const resetChatBtn = document.getElementById("reset-chat-btn");
const msgCounter = document.getElementById("msg-counter");

// Mobile Sidebar Controls
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const openSidebarMobile = document.getElementById("open-sidebar-mobile");
const closeSidebarMobile = document.getElementById("close-sidebar-mobile");

// Temp State untuk Gambar Terpilih
let selectedImageData = null;

// App Session State
let sessionData = {
    timestamp: Date.now(),
    messages: []
};

// --- Dynamic File Input Initialization ---
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.className = "hidden";
document.body.appendChild(fileInput);

// --- Theme Toggle Logic ---
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add("dark");
        if (lightIcon) lightIcon.classList.remove("hidden");
        if (darkIcon) darkIcon.classList.add("hidden");
    } else {
        document.documentElement.classList.remove("dark");
        if (darkIcon) darkIcon.classList.remove("hidden");
        if (lightIcon) lightIcon.classList.add("hidden");
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.documentElement.classList.toggle("dark");
        localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
        if (darkIcon) darkIcon.classList.toggle("hidden", isDark);
        if (lightIcon) lightIcon.classList.toggle("hidden", !isDark);
    });
}

// --- Sidebar Mobile Controls ---
function toggleMobileSidebar(open) {
    if (!sidebar || !sidebarBackdrop) return;
    if (open) {
        sidebar.classList.remove("-translate-x-full");
        sidebarBackdrop.classList.remove("hidden");
    } else {
        sidebar.classList.add("-translate-x-full");
        sidebarBackdrop.classList.add("hidden");
    }
}

if (openSidebarMobile) openSidebarMobile.addEventListener("click", () => toggleMobileSidebar(true));
if (closeSidebarMobile) closeSidebarMobile.addEventListener("click", () => toggleMobileSidebar(false));
if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", () => toggleMobileSidebar(false));

// --- Helper Konversi File ke Base64 ---
function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1]; // Murni Base64 tanpa header prefix
            resolve({
                mimeType: file.type,
                data: base64String
            });
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// --- Event Upload Gambar ---
const mockAttach = document.getElementById("mock-attach");
if (mockAttach) {
    mockAttach.addEventListener("click", () => {
        fileInput.click();
    });
}

fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith("image/")) {
            alert("Harap pilih file berupa gambar (JPG, PNG, WebP, dll).");
            return;
        }
        try {
            selectedImageData = await convertFileToBase64(file);
            showImagePreview(file);
        } catch (err) {
            console.error("Gagal membaca file gambar:", err);
        }
    }
});

function showImagePreview(file) {
    let previewContainer = document.getElementById("image-preview-container");
    if (!previewContainer) {
        previewContainer = document.createElement("div");
        previewContainer.id = "image-preview-container";
        previewContainer.className = "flex items-center gap-2 p-2 mb-2 bg-slate-200/60 dark:bg-slate-700/60 rounded-lg text-xs";
        chatForm.insertBefore(previewContainer, chatForm.firstChild);
    }
    
    previewContainer.innerHTML = `
        <span class="truncate font-medium text-slate-700 dark:text-slate-200">🖼️ ${file.name}</span>
        <button type="button" id="remove-image-btn" class="ml-auto text-rose-500 hover:text-rose-600 font-bold px-1.5 cursor-pointer">✕</button>
    `;

    document.getElementById("remove-image-btn").addEventListener("click", clearImageSelection);
}

function clearImageSelection() {
    selectedImageData = null;
    fileInput.value = "";
    const previewContainer = document.getElementById("image-preview-container");
    if (previewContainer) previewContainer.remove();
}

// --- Session Storage & Persistence ---
function loadSession() {
    try {
        const rawData = localStorage.getItem(STORAGE_KEY);
        if (rawData) {
            const parsed = JSON.parse(rawData);
            const now = Date.now();

            if (now - parsed.timestamp < SESSION_EXPIRY_MS) {
                sessionData = parsed;
            } else {
                clearSession();
                return;
            }
        }
    } catch (e) {
        console.error("Gagal membaca riwayat lokal", e);
    }

    if (!sessionData.messages || sessionData.messages.length === 0) {
        sessionData.messages = [
            {
                role: "model",
                text: "Halo! Saya Celeste AI, teman belajar dan asisten virtual Anda. Ada konsep atau materi yang ingin didiskusikan hari ini?",
                time: formatTime(new Date())
            }
        ];
        saveSession();
    }

    renderAllMessages();
}

function saveSession() {
    sessionData.timestamp = Date.now();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) {
        console.warn("Penyimpanan lokal penuh, menyimpan tanpa gambar lama...", e);
        // Fallback jika localStorage penuh: hapus data gambar dari pesan lama untuk menghemat memori
        const cleanSession = {
            ...sessionData,
            messages: sessionData.messages.map(m => {
                const { image, ...rest } = m;
                return rest;
            })
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanSession));
        } catch (err) {
            console.error("Gagal menyimpan session:", err);
        }
    }
    updateMsgCounter();
}

function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    clearImageSelection();
    sessionData = {
        timestamp: Date.now(),
        messages: [
            {
                role: "model",
                text: "Halo! Sesi obrolan baru Celeste AI telah dimulai. Ada yang bisa saya bantu?",
                time: formatTime(new Date())
            }
        ]
    };
    saveSession();
    renderAllMessages();
}

function formatTime(dateObj) {
    return new Date(dateObj).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateMsgCounter() {
    if (msgCounter) {
        msgCounter.textContent = sessionData.messages.length;
    }
}

// --- Render Messages UI ---
function createMessageElement(role, text, timeText, imageObj = null) {
    const wrapper = document.createElement("div");
    const isUser = role === "user";

    wrapper.className = isUser
        ? "flex flex-col items-end max-w-[85%] sm:max-w-[75%] ml-auto space-y-1"
        : "flex flex-col items-start max-w-[85%] sm:max-w-[75%] space-y-1";

    // Bubble Element
    const bubble = document.createElement("div");
    bubble.className = isUser
        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2.5 rounded-2xl rounded-tr-xs text-sm shadow-sm leading-relaxed break-words w-full"
        : "bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/50 text-slate-800 dark:text-slate-100 px-4 py-2.5 rounded-2xl rounded-tl-xs text-sm shadow-sm leading-relaxed break-words prose dark:prose-invert w-full";

    // Jika pesan menyertakan gambar
    if (imageObj && imageObj.data && imageObj.mimeType) {
        const imgEl = document.createElement("img");
        imgEl.src = `data:${imageObj.mimeType};base64,${imageObj.data}`;
        imgEl.className = "max-w-full max-h-60 rounded-lg mb-2 object-cover border border-slate-300/30";
        bubble.appendChild(imgEl);
    }

    if (text) {
        const textContainer = document.createElement("div");
        if (isUser) {
            textContainer.textContent = text;
        } else {
            if (window.marked) {
                textContainer.innerHTML = marked.parse(text);
            } else {
                textContainer.textContent = text;
            }
        }
        bubble.appendChild(textContainer);
    }

    // Time Metadata
    const meta = document.createElement("span");
    meta.className = "text-[10px] text-slate-400 dark:text-slate-500 px-1";
    meta.textContent = timeText || formatTime(new Date());

    wrapper.appendChild(bubble);
    wrapper.appendChild(meta);

    return { wrapper, bubble };
}

function renderAllMessages() {
    if (!chatBox) return;
    chatBox.innerHTML = "";
    sessionData.messages.forEach(msg => {
        const { wrapper } = createMessageElement(msg.role, msg.text, msg.time, msg.image);
        chatBox.appendChild(wrapper);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
    updateMsgCounter();
}

function appendMessage(role, text, imageObj = null) {
    const currentTime = formatTime(new Date());
    const msgObj = { role, text, time: currentTime };
    if (imageObj) msgObj.image = imageObj;

    sessionData.messages.push(msgObj);
    saveSession();

    const { wrapper } = createMessageElement(role, text, currentTime, imageObj);
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- Textarea Auto Expand & Shortcut ---
if (userInput) {
    userInput.addEventListener("input", () => {
        userInput.style.height = "auto";
        userInput.style.height = Math.min(userInput.scrollHeight, 128) + "px";
    });

    userInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (chatForm) chatForm.dispatchEvent(new Event("submit"));
        }
    });
}

// --- Chat Form Handling & Backend Express API ---
if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const userText = userInput.value.trim();
        const currentImageData = selectedImageData;

        if (!userText && !currentImageData) return;

        // 1. Reset Input UI & Attachment
        userInput.value = "";
        userInput.style.height = "auto";
        userInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        clearImageSelection();

        // 2. Append User Message
        appendMessage("user", userText, currentImageData);

        // 3. Show Bot Thinking Indicator
        const { wrapper: thinkingWrapper, bubble: botBubble } = createMessageElement("model", "...", formatTime(new Date()));
        botBubble.classList.add("animate-pulse", "text-slate-400");
        chatBox.appendChild(thinkingWrapper);
        chatBox.scrollTop = chatBox.scrollHeight;

        try {
            // Format payload termasuk objek gambar jika ada
            const payload = sessionData.messages.map(m => {
                const item = { role: m.role, text: m.text };
                if (m.image) item.image = m.image;
                return item;
            });

            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    conversation: payload,
                }),
            });

            if (chatBox.contains(thinkingWrapper)) {
                chatBox.removeChild(thinkingWrapper);
            }

            const data = await response.json();

            // Tangani response HTTP error (seperti 429 Rate Limit, 413 Payload Large, 500)
            if (!response.ok) {
                const errorMessage = data && data.error ? data.error : `Terjadi kesalahan pada server (Status: ${response.status}).`;
                appendMessage("model", `⚠️ **Informasi:** ${errorMessage}`);
                return;
            }

            const botReply = (data && data.result) ? data.result : "Tidak ada respon dari server.";
            appendMessage("model", botReply);

        } catch (error) {
            console.error("Chat Error:", error);
            if (chatBox.contains(thinkingWrapper)) {
                chatBox.removeChild(thinkingWrapper);
            }
            appendMessage("model", "Maaf, terjadi masalah koneksi saat menghubungkan ke server.");
        } finally {
            userInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            userInput.focus();
        }
    });
}

// --- Handlers Tombol Reset Obrolan ---
if (resetChatBtn) {
    resetChatBtn.addEventListener("click", () => {
        if (confirm("Apakah Anda yakin ingin mereset seluruh obrolan?")) {
            clearSession();
            toggleMobileSidebar(false);
        }
    });
}

// --- Realtime Clock Jakarta (WIB) ---
function updateJakartaClock() {
    const now = new Date();
    const optionsTime = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const optionsDate = { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

    const timeStr = new Intl.DateTimeFormat('id-ID', optionsTime).format(now);
    const dateStr = new Intl.DateTimeFormat('id-ID', optionsDate).format(now);

    const clockEl = document.getElementById('jakarta-clock');
    const dateEl = document.getElementById('jakarta-date');

    if (clockEl) clockEl.textContent = timeStr.replace(/\./g, ':');
    if (dateEl) dateEl.textContent = dateStr;
}

// --- Initial Load ---
window.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadSession();
    updateJakartaClock();
    setInterval(updateJakartaClock, 1000);
});