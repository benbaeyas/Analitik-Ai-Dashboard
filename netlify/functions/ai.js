// netlify/functions/ai.js
// Serverless function — API key dibaca dari Netlify Environment Variables
// Menggantikan route /api/ai dari server.js lokal

const https = require('https');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

exports.handler = async function (event) {
  // Hanya izinkan POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.GROQ_API_KEY;
  const MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'GROQ_API_KEY belum dikonfigurasi di Netlify Environment Variables.' })
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body.' })
    };
  }

  let messages;

  if (parsed.messages) {
    messages = parsed.messages;
  } else {
    const { prompt, systemInstruction } = parsed;
    messages = [
      { role: 'system', content: systemInstruction || 'Anda adalah asisten AI ahli dalam analisis data.' },
      { role: 'user',   content: prompt }
    ];
  }

  const payload = JSON.stringify({
    model: MODEL,
    messages
  });

  // Panggil Groq API menggunakan native https
  const groqResponse = await new Promise((resolve, reject) => {
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

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  return {
    statusCode: groqResponse.status,
    headers: { 'Content-Type': 'application/json' },
    body: groqResponse.body
  };
};
