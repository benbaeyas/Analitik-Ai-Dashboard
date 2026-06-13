// server.js — Lightweight proxy server
// Keeps API key on the server side, never exposed to the browser.
// Serves static files AND proxies AI requests to Groq.

require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT      = process.env.PORT || 3000;
const API_KEY   = process.env.GROQ_API_KEY;
const MODEL     = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions';

// ── MIME types for static file serving ─────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.csv':  'text/csv',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── Groq proxy handler ────────────────────────────────────────
async function handleAI(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { prompt, systemInstruction } = JSON.parse(body);

      const payload = JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemInstruction || 'Anda adalah asisten AI ahli dalam analisis data.' },
          { role: 'user',   content: prompt }
        ]
      });

      // Use native https module to call Groq
      const https = require('https');
      const groqUrl = new URL(GROQ_URL);

      const options = {
        hostname: groqUrl.hostname,
        path:     groqUrl.pathname,
        method:   'POST',
        headers: {
          'Authorization':  `Bearer ${API_KEY}`,
          'Content-Type':   'application/json',
          'Content-Length':  Buffer.byteLength(payload),
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy request error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gagal menghubungi Groq API.' }));
      });

      proxyReq.write(payload);
      proxyReq.end();

    } catch (err) {
      console.error('AI handler error:', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body.' }));
    }
  });
}

// ── Static file handler ───────────────────────────────────────
function serveStatic(req, res) {
  let filePath = path.join(__dirname, url.parse(req.url).pathname);
  if (filePath.endsWith(path.sep) || filePath.endsWith('/')) filePath += 'index.html';

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? '404 Not Found' : 'Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  });
}

// ── Server ────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && url.parse(req.url).pathname === '/api/ai') {
    handleAI(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`\n  ┌───────────────────────────────────────┐`);
  console.log(`  │  Dashboard server running             │`);
  console.log(`  │  → http://localhost:${PORT}              │`);
  console.log(`  │  API Key: ****${API_KEY.slice(-4)} (hidden)       │`);
  console.log(`  └───────────────────────────────────────┘\n`);
});
