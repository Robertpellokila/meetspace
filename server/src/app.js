import express from 'express';
import cors from 'cors';

import roomRoutes from './routes/room.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import whiteboardRoutes from './routes/whiteboard.routes.js';
import gameContentRoutes from './routes/gameContent.js';
import gameCatalogRoutes from './routes/gameCatalog.js';
import soundEffectsRoutes from './routes/soundEffects.js';
import authRoutes from './routes/auth.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use('/api/webhooks', webhookRoutes);
app.use('/api/whiteboards', whiteboardRoutes);
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'MeetSpace API is running' });
});

app.use('/api/rooms', roomRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game-content', gameContentRoutes);
app.use('/api/game-catalog', gameCatalogRoutes);
app.use('/api/sound-effects', soundEffectsRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

export default app;
