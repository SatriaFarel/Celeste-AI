import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import handlerChat from "./api/chat.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static frontend files (HTML, CSS, JS) dari folder public
app.use(express.static("public"));

// Route handler untuk endpoint POST /api/chat
app.post("/api/chat", (req, res) => {
  return handlerChat(req, res);
});

// Fallback untuk route root
app.get("/", (req, res) => {
  res.sendFile(path.resolve("public", "index.html"));
});

export default app;

// Jalankan server lokal jika file dijalankan langsung
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running locally on: http://localhost:${PORT}`);
});
