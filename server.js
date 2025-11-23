require('dotenv').config();
const express = require('express');
const path = require('path');
const { query } = require('./db');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const { nanoid } = require('nanoid');
const expressLayouts = require('express-ejs-layouts');   

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);        
app.set('layout', 'layout');    

const CODE_REGEX = /^[A-Za-z0-9]{6,8}$/;

function isValidCode(code) {
  return CODE_REGEX.test(code);
}

function isValidUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}



app.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT code, url, clicks, last_clicked, created_at FROM links ORDER BY created_at DESC'
    );
    res.render('index', { links: result.rows, baseUrl: BASE_URL });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/code/:code', async (req, res) => {
  const { code } = req.params;
  if (!isValidCode(code)) return res.status(400).send('Invalid code format');

  try {
    const result = await query('SELECT * FROM links WHERE code=$1', [code]);
    if (result.rows.length === 0) return res.status(404).send('Not found');
    res.render('stats', { link: result.rows[0], baseUrl: BASE_URL });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});



app.get('/healthz', (req, res) => {
  res.json({ ok: true, version: '1.0', uptime: process.uptime() });
});



app.post('/api/links', async (req, res) => {
  const { url, code: customCode } = req.body || {};

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  let code = customCode;

  if (code) {
    if (!isValidCode(code)) {
      return res
        .status(400)
        .json({ error: 'Invalid custom code. Use [A-Za-z0-9]{6,8}' });
    }
  } else {
    code = nanoid(7).replace(/_/g, 'A');
  }

  try {
    const insert =
      'INSERT INTO links(code, url) VALUES($1, $2) RETURNING code, url, clicks, last_clicked, created_at';

    const result = await query(insert, [code, url]);

    return res.status(201).json({
      ok: true,
      link: result.rows[0],
      shortUrl: `${BASE_URL}/${code}`,
    });
  } catch (err) {
    if (err.code === '23505' || /duplicate key/.test(err.message)) {
      return res.status(409).json({ error: 'Code already exists' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const result = await query(
      'SELECT code, url, clicks, last_clicked, created_at FROM links ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/links/:code', async (req, res) => {
  const { code } = req.params;

  if (!isValidCode(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  try {
    const r = await query(
      'SELECT code, url, clicks, last_clicked, created_at FROM links WHERE code=$1',
      [code]
    );

    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/links/:code', async (req, res) => {
  const { code } = req.params;

  if (!isValidCode(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  try {
    const r = await query('DELETE FROM links WHERE code=$1 RETURNING code', [
      code,
    ]);

    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    res.status(200).json({ ok: true, deleted: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/:code', async (req, res) => {
  const { code } = req.params;

  if (!isValidCode(code)) return res.status(404).send('Not found');

  try {
    const r = await query('SELECT url FROM links WHERE code=$1', [code]);

    if (r.rows.length === 0) return res.status(404).send('Not found');

    const url = r.rows[0].url;

    await query(
  "UPDATE links SET clicks = clicks + 1, last_clicked = (NOW() AT TIME ZONE 'Asia/Kolkata') WHERE code=$1",
  [code]
);


    res.redirect(302, url);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});



app.listen(PORT, () => {
  console.log(`TinyLink listening on ${PORT} - baseUrl=${BASE_URL}`);
});
