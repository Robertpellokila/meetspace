
import express from "express";
import cors from "cors";
import "dotenv/config";

import roomRoutes from "./routes/room.js";
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import whiteboardRoutes from './routes/whiteboard.routes.js';
import gameContentRoutes from './routes/gameContent.js';
import gameCatalogRoutes from './routes/gameCatalog.js';
import soundEffectsRoutes from './routes/soundEffects.js';

const app = express();

const PORT = process.env.PORT || 3000;

// Mengizinkan frontend Vue melakukan request
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  })
);

// Membaca request body berformat JSON
app.use('/api/webhooks', webhookRoutes);
app.use('/api/whiteboards', whiteboardRoutes);
app.use(express.json({limit:'64kb'}));

// Endpoint untuk mengecek server
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "MeetSpace API is running",
  });
});

// Mendaftarkan routes room
app.use("/api/rooms", roomRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game-content', gameContentRoutes);
app.use('/api/game-catalog', gameCatalogRoutes);
app.use('/api/sound-effects', soundEffectsRoutes);

// Menangani endpoint yang tidak ditemukan
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// Menjalankan backend
app.listen(PORT, (error) => {
  if (error) {
    console.error(`Could not start MeetSpace API: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`MeetSpace API running on port ${PORT}`);
});
