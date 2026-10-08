const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache to avoid hitting upstream APIs too frequently
let cache = {
  pakistanLatest: { data: null, time: 0 },
  pakistanHistory: { data: null, time: 0 },
  globalHistory: { data: null, time: 0 },
  eklitreHistory: { data: null, time: 0 }
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Latest Pakistan prices
app.get('/api/pakistan/latest', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.pakistanLatest.data && (now - cache.pakistanLatest.time) < CACHE_TTL) {
      return res.json(cache.pakistanLatest.data);
    }

    const resp = await fetch('https://oilprices.pk/api/latest', { timeout: 10000 });
    const data = await resp.json();
    cache.pakistanLatest = { data, time: now };
    res.json(data);
  } catch (err) {
    console.error('Pakistan latest error:', err.message);
    if (cache.pakistanLatest.data) return res.json(cache.pakistanLatest.data);
    res.status(503).json({ error: 'Unable to fetch Pakistan fuel prices' });
  }
});

// API: Pakistan historical prices (from oilprices.pk)
app.get('/api/pakistan/history', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.pakistanHistory.data && (now - cache.pakistanHistory.time) < CACHE_TTL * 6) {
      return res.json(cache.pakistanHistory.data);
    }

    // Fetch all petrol history
    const resp = await fetch('https://oilprices.pk/api/price-history?product=Petrol&limit=5000', { timeout: 15000 });
    const petrolData = await resp.json();

    // Also fetch diesel
    const resp2 = await fetch('https://oilprices.pk/api/price-history?product=Diesel&limit=5000', { timeout: 15000 });
    const dieselData = await resp2.json();

    const data = { petrol: petrolData, diesel: dieselData };
    cache.pakistanHistory = { data, time: now };
    res.json(data);
  } catch (err) {
    console.error('Pakistan history error:', err.message);
    if (cache.pakistanHistory.data) return res.json(cache.pakistanHistory.data);
    res.status(503).json({ error: 'Unable to fetch Pakistan price history' });
  }
});

// API: Long-term Pakistan historical prices (from eklitre.pk - data since 2006)
app.get('/api/pakistan/long-history', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.eklitreHistory.data && (now - cache.eklitreHistory.time) < CACHE_TTL * 12) {
      return res.json(cache.eklitreHistory.data);
    }

    const resp = await fetch('https://eklitre.pk/data/notified-prices.json', { timeout: 15000 });
    const raw = await resp.json();
    const notifs = raw.notifications || [];

    // Deduplicate by date, keeping the last entry per date
    const byDate = {};
    for (const r of notifs) {
      byDate[r[0]] = { date: r[0], petrol: r[1], diesel: r[2], kerosene: r[3], lightDiesel: r[4] };
    }

    const sorted = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    cache.eklitreHistory = { data: sorted, time: now };
    res.json(sorted);
  } catch (err) {
    console.error('Eklitre history error:', err.message);
    if (cache.eklitreHistory.data) return res.json(cache.eklitreHistory.data);
    res.status(503).json({ error: 'Unable to fetch long-term price history' });
  }
});

// API: Global oil prices (WTI, Brent from worldoilmonitor.com)
app.get('/api/global/history', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.globalHistory.data && (now - cache.globalHistory.time) < CACHE_TTL * 6) {
      return res.json(cache.globalHistory.data);
    }

    const resp = await fetch('https://worldoilmonitor.com/download.php?dataset=history&format=json', { timeout: 15000 });
    const data = await resp.json();
    cache.globalHistory = { data, time: now };
    res.json(data);
  } catch (err) {
    console.error('Global history error:', err.message);
    if (cache.globalHistory.data) return res.json(cache.globalHistory.data);
    res.status(503).json({ error: 'Unable to fetch global oil prices' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Pakistan Petrol Prices dashboard running on port ${PORT}`);
});