// --- Configuration Constants ---
const STORAGE_KEY = 'app_chat_session_v1';
const THEME_KEY = 'app_theme_mode';
const MODEL_KEY = 'app_selected_model';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 jam

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

// Dropdown Select Model (Desktop & Mobile)
const modelSelectDesktop = document.getElementById("model-select");
const modelSelectMobile = document.getElementById("model-select-mobile");

// Sidebar & Drawer Controls
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const openSidebarMobile = document.getElementById("open-sidebar-mobile");
const closeSidebarMobile = document.getElementById("close-sidebar-mobile");

// Input File Handling
const btnGallery = document.getElementById("btn-attach-gallery");
const btnCamera = document.getElementById("btn-attach-camera");
const inputGallery = document.getElementById("file-input-gallery");
const inputCamera = document.getElementById("file-input-camera");

// State Gambar Terpilih
let selectedImageData = null;

// App Session State
let sessionData = {
    timestamp: Date.now(),
    messages: []
};

// --- Model Selection Handling & Synchronization ---
function getSelectedModel() {
    return localStorage.getItem(MODEL_KEY) || (modelSelectDesktop ? modelSelectDesktop.value : 'mimo-v2.5-pro');
}

function initModel() {
    const savedModel = getSelectedModel();
    if (modelSelectDesktop) modelSelectDesktop.value = savedModel;
    if (modelSelectMobile) modelSelectMobile.value = savedModel;
}

function handleModelChange(e) {
    const selectedValue = e.target.value;
    localStorage.setItem(MODEL_KEY, selectedValue);
    if (modelSelectDesktop) modelSelectDesktop.value = selectedValue;
    if (modelSelectMobile) modelSelectMobile.value = selectedValue;
}

if (modelSelectDesktop) modelSelectDesktop.addEventListener("change", handleModelChange);
if (modelSelectMobile) modelSelectMobile.addEventListener("change", handleModelChange);

// --- Theme Toggle ---
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

// --- Responsive Mobile Sidebar (Drawer) ---
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

// --- Image Handling & Base64 Converter ---
function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve({
                mimeType: file.type,
                data: base64String
            });
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

btnGallery?.addEventListener("click", () => inputGallery?.click());
btnCamera?.addEventListener("click", () => inputCamera?.click());

async function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Harap pilih file berformat gambar (JPG, PNG, WebP).");
        return;
    }

    try {
        selectedImageData = await convertFileToBase64(file);
        showImagePreview(file);
    } catch (err) {
        console.error("Gagal membaca gambar:", err);
    }
}

inputGallery?.addEventListener("change", handleImageSelect);
inputCamera?.addEventListener("change", handleImageSelect);

function showImagePreview(file) {
    let previewContainer = document.getElementById("image-preview-container");
    if (!previewContainer) {
        previewContainer = document.createElement("div");
        previewContainer.id = "image-preview-container";
        previewContainer.className = "flex items-center gap-2 p-2 mb-1 bg-slate-200/60 dark:bg-slate-700/60 rounded-xl text-xs w-full max-w-full overflow-hidden";
        chatForm.insertBefore(previewContainer, chatForm.firstChild);
    }

    const previewUrl = `data:${selectedImageData.mimeType};base64,${selectedImageData.data}`;
    
    previewContainer.innerHTML = `
        <img src="${previewUrl}" class="w-9 h-9 object-cover rounded-lg border border-slate-300 dark:border-slate-600 shrink-0" alt="Preview" />
        <span class="truncate font-medium text-slate-700 dark:text-slate-200 flex-1">${file.name}</span>
        <button type="button" id="remove-image-btn" class="text-rose-500 hover:text-rose-600 font-bold px-2 py-1 cursor-pointer rounded-lg active:bg-rose-100 dark:active:bg-rose-950/40">✕</button>
    `;

    document.getElementById("remove-image-btn")?.addEventListener("click", clearImageSelection);
}

function clearImageSelection() {
    selectedImageData = null;
    if (inputGallery) inputGallery.value = "";
    if (inputCamera) inputCamera.value = "";
    const previewContainer = document.getElementById("image-preview-container");
    if (previewContainer) previewContainer.remove();
}

// --- Session Persistence ---
function loadSession() {
    try {
        const rawData = localStorage.getItem(STORAGE_KEY);
        if (rawData) {
            const parsed = JSON.parse(rawData);
            if (Date.now() - parsed.timestamp < SESSION_EXPIRY_MS) {
                sessionData = parsed;
            } else {
                clearSession();
                return;
            }
        }
    } catch (e) {
        console.error("Gagal membaca riwayat", e);
    }

    if (!sessionData.messages || sessionData.messages.length === 0) {
        sessionData.messages = [
            {
                role: "model",
                text: "Halo! Saya Celeste AI, teman belajar dan asisten virtual Anda. Ada materi atau foto tugas yang ingin kita bahas hari ini?",
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
    if (msgCounter) msgCounter.textContent = sessionData.messages.length;
}

// --- Render Messages UI ---
function createMessageElement(role, text, timeText, imageObj = null) {
    const wrapper = document.createElement("div");
    const isUser = role === "user";

    wrapper.className = isUser
        ? "flex flex-col items-end max-w-[90%] sm:max-w-[80%] ml-auto space-y-1"
        : "flex flex-col items-start max-w-[90%] sm:max-w-[80%] space-y-1";

    const bubble = document.createElement("div");
    bubble.className = isUser
        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3.5 py-2.5 rounded-2xl rounded-tr-xs text-sm shadow-xs leading-relaxed break-words w-full"
        : "bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/50 text-slate-800 dark:text-slate-100 px-3.5 py-2.5 rounded-2xl rounded-tl-xs text-sm shadow-xs leading-relaxed break-words prose dark:prose-invert w-full";

    bubble.classList.add("app-message-bubble", isUser ? "app-message-user" : "app-message-assistant");

    if (imageObj && imageObj.data && imageObj.mimeType) {
        const imgEl = document.createElement("img");
        imgEl.src = `data:${imageObj.mimeType};base64,${imageObj.data}`;
        imgEl.className = "max-w-full max-h-64 sm:max-h-80 rounded-xl mb-2 object-cover border border-slate-300/30";
        bubble.appendChild(imgEl);
    }

    if (text) {
        const textContainer = document.createElement("div");
        if (isUser) {
            textContainer.textContent = text;
        } else {
            textContainer.innerHTML = window.marked ? marked.parse(text) : text;
        }
        bubble.appendChild(textContainer);
    }

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

// --- Textarea Expand & Enter Shortcut ---
if (userInput) {
    userInput.addEventListener("input", () => {
        userInput.style.height = "auto";
        userInput.style.height = Math.min(userInput.scrollHeight, 128) + "px";
    });

    userInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 640) {
            e.preventDefault();
            if (chatForm) chatForm.dispatchEvent(new Event("submit"));
        }
    });
}

// --- Chat Form Handling & Backend Vercel API Integration ---
if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const userText = userInput.value.trim();
        const currentImageData = selectedImageData;
        const selectedModel = getSelectedModel();

        if (!userText && !currentImageData) return;

        // Reset Input UI
        userInput.value = "";
        userInput.style.height = "auto";
        userInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        clearImageSelection();

        // Append User Message
        appendMessage("user", userText, currentImageData);

        // Indicator Loading
        const { wrapper: thinkingWrapper, bubble: botBubble } = createMessageElement("model", "...", formatTime(new Date()));
        botBubble.classList.add("animate-pulse", "text-slate-400");
        chatBox.appendChild(thinkingWrapper);
        chatBox.scrollTop = chatBox.scrollHeight;

        try {
            const payload = sessionData.messages.map(m => {
                const item = { role: m.role, text: m.text };
                if (m.image) item.image = m.image;
                return item;
            });

            // Kirim model terpilih bersama conversation payload ke Vercel API
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: selectedModel,
                    conversation: payload
                }),
            });

            if (chatBox.contains(thinkingWrapper)) {
                chatBox.removeChild(thinkingWrapper);
            }

            const data = await response.json();

            if (!response.ok) {
                const errorMessage = data && data.error ? data.error : `Terjadi kesalahan server (${response.status}).`;
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

// --- Reset Button ---
if (resetChatBtn) {
    resetChatBtn.addEventListener("click", () => {
        if (confirm("Apakah Anda yakin ingin mereset seluruh obrolan?")) {
            clearSession();
            toggleMobileSidebar(false);
        }
    });
}

// --- Realtime Clock (WIB) ---
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

// Initial Load
window.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initModel();
    loadSession();
    updateJakartaClock();
    setInterval(updateJakartaClock, 1000);
});