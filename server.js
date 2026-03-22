require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');

const app        = express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer, { cors: { origin: '*' } });

// ─── Share io with routes ──────────────────────────────────────
app.set('io', io);

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

async function seedAll() {
  const { seedAdmin }    = require('./routes/auth');
  const { seedProducts } = require('./routes/products');
  const { seedContent }  = require('./routes/content');
  await Promise.all([seedAdmin(), seedProducts(), seedContent()]);
}
