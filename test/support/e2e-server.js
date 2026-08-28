// Boots the full-stack harness (real app + static site) over the in-memory
// Supabase double so a real browser can walk the actual pages without any
// production credentials or data. Port via E2E_PORT (default 4599).
//   node test/support/e2e-server.js
'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret';
process.env.NODE_ENV = 'test';

const { buildApp } = require('./app-harness');
const { seed } = require('./e2e-seed');

const { app } = buildApp(seed(), { quiet: true, serveStatic: true });
const PORT = Number(process.env.E2E_PORT) || 4599;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`E2E harness listening on http://127.0.0.1:${PORT}`);
  console.log('Logins (password "Passw0rd!"):');
  console.log('  student  ada@test.local  (Batch Alpha / b1)');
  console.log('  student  ben@test.local  (Batch Beta / b2)');
  console.log('  lecturer lex@test.local  (b1)');
  console.log('  admin    admin@test.local');
});
