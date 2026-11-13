import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { runMigrations } from './server/db/schema';
import { seedDatabase } from './server/db/seed';
import { authRouter } from './server/routes/auth';
import { studentRouter } from './server/routes/student';
import { teacherRouter } from './server/routes/teacher';
import { adminRouter } from './server/routes/admin';
import { aiRouter } from './server/routes/ai';

const PORT = 3000;

async function startServer() {
  // Initialize SQLite schema & seed demonstration institution
  runMigrations();
  seedDatabase();

  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'CampusGPT' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/teacher', teacherRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/ai', aiRouter);

  // Multer & API error handler
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err?.status || 400;
    res.status(status).json({ error: err?.message || 'Unexpected server error.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusGPT server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CampusGPT server:', err);
  process.exit(1);
});
