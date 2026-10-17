import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import app from './app.js';

// Reuse the same Express routes as the local Node server.
export default httpServerHandler(createServer(app));
