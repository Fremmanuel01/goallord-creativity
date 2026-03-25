require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app        = express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer, { cors: { origin: ['https://goallordcreativity.com', 'https://www.goallordcreativity.com', 'http://localhost:3000'] } });

// ─── Share io with routes ──────────────────────────────────────
app.set('io', io);

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({
    origin: ['https://goallordcreativity.com', 'https://www.goallordcreativity.com', 'http://localhost:3000'],
    credentials: true
}));
app.use(helmet({
    contentSecurityPolicy: false, // disable CSP since we use inline scripts/styles
    crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── GLOBAL API RATE LIMITER ─────────────────────────────────
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 min
    message: { error: 'Too many requests, please try again later.' }
}));

// ─── AFFILIATE REDIRECT (must be before static) ───────────────
app.use('/go', require('./routes/go'));

// ─── DYNAMIC SITEMAP (must be before static so it overrides sitemap.xml) ─────
app.get('/sitemap.xml', async (req, res) => {
  try {
    const BlogPost = require('./models/BlogPost');
    const posts = await BlogPost.find({ published: true }, 'slug publishedAt updatedAt').sort({ publishedAt: -1 });
    const base = 'https://goallordcreativity.com';
    const now  = new Date().toISOString().split('T')[0];
    const staticPages = [
      { url: '/',             priority: '1.0', freq: 'weekly'  },
      { url: '/services.html',priority: '0.9', freq: 'monthly' },
      { url: '/academy.html', priority: '0.9', freq: 'weekly'  },
      { url: '/about.html',   priority: '0.8', freq: 'monthly' },
      { url: '/portfolio.html',priority:'0.8', freq: 'weekly'  },
      { url: '/contact.html', priority: '0.8', freq: 'monthly' },
      { url: '/blog.html',    priority: '0.8', freq: 'weekly'  },
      { url: '/pricing.html', priority: '0.7', freq: 'monthly' },
      { url: '/apply.html',   priority: '0.6', freq: 'monthly' },
      { url: '/alumni.html',  priority: '0.6', freq: 'monthly' },
    ];
    const urlTags = [
      ...staticPages.map(p =>
        `  <url><loc>${base}${p.url}</loc><lastmod>${now}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`
      ),
      ...posts.map(post => {
        const mod = post.updatedAt ? post.updatedAt.toISOString().split('T')[0] : now;
        return `  <url><loc>${base}/blog-single.html?slug=${encodeURIComponent(post.slug)}</loc><lastmod>${mod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
      }),
    ];
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlTags.join('\n')}\n</urlset>`);
  } catch (err) {
    res.status(500).send('Sitemap error');
  }
});

// ─── STATIC FILES (serve the website) ────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── PUBLIC CONFIG ────────────────────────────────────────────
app.get('/api/config/public', (req, res) => {
  res.json({
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    bank: {
      name:        process.env.BANK_NAME || '',
      number:      process.env.BANK_ACCOUNT_NUMBER || '',
      accountName: process.env.BANK_ACCOUNT_NAME || ''
    },
    bank2: {
      name:        process.env.BANK2_NAME || '',
      number:      process.env.BANK2_ACCOUNT_NUMBER || '',
      accountName: process.env.BANK2_ACCOUNT_NAME || ''
    },
    fees: {
      application:    Number(process.env.APPLICATION_FEE)    || 20000,
      fullTuition:    Number(process.env.FULL_TUITION_FEE)   || 150000,
      monthlyTuition: Number(process.env.MONTHLY_TUITION_FEE) || 60000
    }
  });
});

// ─── API ROUTES ───────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/applicants',    require('./routes/applicants'));
app.use('/api/clients',       require('./routes/clients'));
app.use('/api/products',      require('./routes/products'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/content',       require('./routes/content'));
app.use('/api/upload',        require('./routes/upload'));
app.use('/api/students',      require('./routes/students'));
app.use('/api/attendance',    require('./routes/attendance'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/batches',       require('./routes/batches'));
app.use('/api/lecturers',     require('./routes/lecturers'));
app.use('/api/materials',     require('./routes/materials'));
app.use('/api/assignments',   require('./routes/assignments'));
app.use('/api/flashcards',    require('./routes/flashcards'));
app.use('/api/curriculum',    require('./routes/curriculum'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat',          require('./routes/chat'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/agents',        require('./routes/agents'));
app.use('/api/contacts',      require('./routes/contacts'));
app.use('/api/blog',          require('./routes/blog'));
app.use('/api/team',          require('./routes/team'));
app.use('/api/logos',         require('./routes/logos'));
app.use('/api/projects',      require('./routes/projects'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/checkins',      require('./routes/checkins'));

app.use('/api/reminders',     require('./routes/reminders'));
app.use('/api/affiliate',     require('./routes/affiliate'));
app.use('/api/analytics',    require('./routes/analytics'));

// ─── SOCKET.IO ────────────────────────────────────────────────
io.on('connection', socket => {

  // Agents authenticate and join the 'agents' room
  socket.on('agent:join', ({ token }) => {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = user;
      socket.join('agents');
      socket.emit('agent:joined', { name: user.name });
      io.to('agents').emit('agent:online', { name: user.name, id: user.id });
    } catch {
      socket.emit('error', { message: 'Invalid token' });
    }
  });

  // Visitor joins their own session room
  socket.on('visitor:join', ({ sessionId }) => {
    socket.join(sessionId);
  });

  socket.on('disconnect', () => {
    if (socket.user) {
      io.to('agents').emit('agent:offline', { name: socket.user.name, id: socket.user.id });
    }
  });
});

// ─── FALLBACK: serve index.html for any unmatched GET ─────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── DATABASE + SEED + START ──────────────────────────────────
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected');
    await seedAll();
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    // ── Task reminder emails (every 2 days) ──────────────────────
    const { startReminderCron } = require('./utils/taskReminders');
    startReminderCron();

    // ── Daily checks (payments + deadline reminders) ─────────────
    const { runOverdueCheck }      = require('./routes/payments');
    const { runDeadlineReminders } = require('./routes/assignments');

    async function runDailyChecks() {
      await runOverdueCheck().catch(e => console.error('Overdue check failed:', e.message));
      await runDeadlineReminders().catch(e => console.error('Deadline reminders failed:', e.message));
    }

    // Run once on startup (after 30s to let DB settle), then every 24h
    setTimeout(() => {
      runDailyChecks();
      setInterval(runDailyChecks, 24 * 60 * 60 * 1000);
    }, 30 * 1000);
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

async function seedAll() {
  const { seedAdmin }      = require('./routes/auth');
  const { seedProducts }   = require('./routes/products');
  const { seedContent }    = require('./routes/content');
  const { seedBlogPosts }  = require('./routes/blog');
  await Promise.all([seedAdmin(), seedProducts(), seedContent(), seedBlogPosts()]);
}
