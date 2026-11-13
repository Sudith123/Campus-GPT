import multer from 'multer';
import { Router } from 'express';
import { db } from '../db/schema';
import { rateLimit, requireAuth } from '../middleware/auth';
import { extractPdfPages, runCampusChat } from '../services/gemini';

export const aiRouter = Router();
aiRouter.use(requireAuth);

const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

aiRouter.get('/conversations', (req, res) => {
  const search = String(req.query.q || '').trim().toLowerCase();
  const rows = db
    .prepare(
      `
      SELECT c.*,
             (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as last_message
      FROM conversations c
      WHERE c.user_id = ?
      ORDER BY c.updated_at DESC, c.id DESC
    `
    )
    .all(req.authUser!.id) as any[];

  const filtered = rows.filter(
    (c) =>
      !search ||
      c.title.toLowerCase().includes(search) ||
      (c.last_message && c.last_message.toLowerCase().includes(search))
  );
  res.json({ conversations: filtered });
});

aiRouter.post('/conversations', (req, res) => {
  const title = String(req.body?.title || 'New CampusGPT Chat').slice(0, 120);
  const language = ['English', 'Kannada', 'Hindi'].includes(req.body?.language)
    ? req.body.language
    : req.authUser!.preferredLanguage;

  const r = db
    .prepare(`INSERT INTO conversations (user_id, title, language) VALUES (?, ?, ?)`)
    .run(req.authUser!.id, title, language);

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({ conversation: conv });
});

aiRouter.delete('/conversations/:id', (req, res) => {
  const id = Number(req.params.id);
  const del = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, req.authUser!.id);
  if (del.changes === 0) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ ok: true });
});

aiRouter.get('/conversations/:id/messages', (req, res) => {
  const id = Number(req.params.id);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, req.authUser!.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(id)
    .map((m: any) => ({
      ...m,
      citations: m.sources_json ? JSON.parse(m.sources_json) : [],
    }));
  res.json({ conversation: conv, messages });
});

aiRouter.post('/chat', rateLimit('ai-chat', 25, 60_000), uploadAttachment.single('file'), async (req, res) => {
  const user = req.authUser!;
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({ error: 'Please enter a message.' });
  }

  const language = (['English', 'Kannada', 'Hindi'].includes(req.body?.language)
    ? req.body.language
    : user.preferredLanguage) as 'English' | 'Kannada' | 'Hindi';

  let conversationId = req.body?.conversationId ? Number(req.body.conversationId) : null;
  if (conversationId) {
    const owned = db
      .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .get(conversationId, user.id);
    if (!owned) return res.status(404).json({ error: 'Conversation not found.' });
  } else {
    const title = prompt.length > 52 ? prompt.slice(0, 52) + '...' : prompt;
    const created = db
      .prepare('INSERT INTO conversations (user_id, title, language) VALUES (?, ?, ?)')
      .run(user.id, title, language);
    conversationId = Number(created.lastInsertRowid);
  }

  let attachmentText: string | undefined;
  if (req.file) {
    try {
      if (req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf')) {
        const extracted = await extractPdfPages(req.file.buffer);
        attachmentText = extracted.pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n');
      } else {
        attachmentText = req.file.buffer.toString('utf-8');
      }
    } catch {
      return res.status(400).json({ error: 'Could not extract readable text from the attached file.' });
    }
  }

  const history = db
    .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversationId) as Array<{ role: 'user' | 'assistant'; content: string }>;

  const userDisplayPrompt = req.file ? `${prompt}\n\n[Attached file: ${req.file.originalname}]` : prompt;

  // Save user message first
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    conversationId,
    'user',
    userDisplayPrompt
  );

  try {
    const aiResult = await runCampusChat({
      user,
      prompt,
      history,
      language,
      attachmentText,
      ipAddress: req.ip,
    });

    const msgRes = db
      .prepare(
        `
        INSERT INTO messages (conversation_id, role, content, classification, sources_json)
        VALUES (?, 'assistant', ?, ?, ?)
      `
      )
      .run(conversationId, aiResult.reply, aiResult.classification, JSON.stringify(aiResult.citations));

    db.prepare(`UPDATE conversations SET updated_at = datetime('now'), language = ? WHERE id = ?`).run(
      language,
      conversationId
    );

    res.json({
      conversationId,
      message: {
        id: Number(msgRes.lastInsertRowid),
        conversation_id: conversationId,
        role: 'assistant',
        content: aiResult.reply,
        classification: aiResult.classification,
        citations: aiResult.citations,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    const errorMsg = err?.message || 'AI request failed.';
    res.status(502).json({
      conversationId,
      error: errorMsg.includes('API_KEY') || errorMsg.includes('GEMINI_API_KEY')
        ? 'Gemini API key is not configured or invalid. Set GEMINI_API_KEY in Settings > Secrets.'
        : errorMsg,
    });
  }
});
