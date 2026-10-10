const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;

// Cache to avoid hitting upstream APIs too frequently
let cache = {
  pakistanLatest: { data: null, time: 0 },
  pakistanHistory: { data: null, time: 0 },
  globalHistory: { data: null, time: 0 },
  eklitreHistory: { data: null, time: 0 }
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper: fetch with timeout using AbortController
function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .then(resp => {
      clearTimeout(timeout);
      return resp;
    })
    .catch(err => {
      clearTimeout(timeout);
      throw err;
    });
}

// Helper: scrape PSO Octane Euro 5 prices from psopk.com
async function scrapePSOOctane() {
  try {
    const resp = await fetchWithTimeout('https://psopk.com/en/fuels/fuel-prices', 15000);
    const html = await resp.text();
    // The table contains rows like: Octane Euro 5 (Karachi) 410.00
    const matches = [...html.matchAll(/Octane\s*Euro\s*5\s*\(([^)]+)\)\s*<\/td>\s*<td[^>]*>\s*([\d.]+)/gi)];
    const cityPrices = {};
    for (const m of matches) {
      cityPrices[m[1].trim()] = parseFloat(m[2]);
    }
    // Get the effective date from the page
    const dateMatch = html.match(/Effective\s*(?:Date|Rate)?\s*[:]*\s*(\d{1,2}\s+\w+\s+202\d)/i);
    const effectiveDate = dateMatch ? dateMatch[1] : null;
    
    // Get the most common price (they're usually all the same)
    const prices = Object.values(cityPrices);
    const priceCounts = {};
    for (const p of prices) {
      priceCounts[p] = (priceCounts[p] || 0) + 1;
    }
    const mostCommonPrice = Object.entries(priceCounts).sort((a, b) => b[1] - a[1])[0];
    
    return {
      price: mostCommonPrice ? mostCommonPrice[0] : null,
      cities: cityPrices,
      effectiveDate
    };
  } catch (err) {
    console.error('PSO scrape error:', err.message);
    return null;
  }
}

// Helper: scrape APL XTRON (Hi-Octane) prices from apl.com.pk
async function scrapeAPLXtron() {
  try {
    const resp = await fetchWithTimeout('https://www.apl.com.pk/locator-data/GasStations.js', 15000);
    const raw = await resp.text();
    
    // Extract the JSON array from "GasStations = [ ... ]"
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']') + 1;
    if (start === -1 || end === 0) return null;
    
    const jsonStr = raw.slice(start, end);
    const stations = JSON.parse(jsonStr);
    
    // Filter stations with non-zero XTRON price
    const xtronStations = stations.filter(s => parseFloat(s.XTRONPrice || '0') > 0);
    
    // Group by price
    const priceGroups = {};
    for (const s of xtronStations) {
      const price = parseFloat(s.XTRONPrice);
      if (!priceGroups[price]) {
        priceGroups[price] = { price, cities: new Set(), count: 0 };
      }
      priceGroups[price].cities.add(s.City || 'Unknown');
      priceGroups[price].count++;
    }
    
    // Get date range
    const fromDates = new Set();
    for (const s of xtronStations) {
      if (s.XTRONFromDate) fromDates.add(s.XTRONFromDate.split(' ')[0]);
    }
    
    // Sort by station count (most common price first)
    const sortedPrices = Object.values(priceGroups).sort((a, b) => b.count - a.count);
    
    return {
      priceTiers: sortedPrices.map(g => ({
        price: g.price,
        stationCount: g.count,
        cities: [...g.cities].slice(0, 10)
      })),
      totalStations: xtronStations.length,
      effectiveDate: [...fromDates][0] || null
    };
  } catch (err) {
    console.error('APL scrape error:', err.message);
    return null;
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Latest Pakistan prices (includes Hi-Octane from PSO and APL)
app.get('/api/pakistan/latest', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.pakistanLatest.data && (now - cache.pakistanLatest.time) < CACHE_TTL) {
      return res.json(cache.pakistanLatest.data);
    }

    // Fetch OGRA prices from oilprices.pk
    const resp = await fetchWithTimeout('https://oilprices.pk/api/latest', 10000);
    const data = await resp.json();

    // Fetch Hi-Octane prices from PSO and APL in parallel
    // Also fetch all 4 product histories to get previous notified prices
    // Note: oilprices.pk returns oldest-first, so we need large limit to get recent entries
    const [psoOctane, aplXtron, petrolHist, dieselHist, keroseneHist, lpgHist] = await Promise.all([
      scrapePSOOctane(),
      scrapeAPLXtron(),
      fetchWithTimeout('https://oilprices.pk/api/price-history?product=Petrol&limit=5000', 10000).then(r => r.json()).catch(() => []),
      fetchWithTimeout('https://oilprices.pk/api/price-history?product=Diesel&limit=5000', 10000).then(r => r.json()).catch(() => []),
      fetchWithTimeout('https://oilprices.pk/api/price-history?product=Kerosene&limit=5000', 10000).then(r => r.json()).catch(() => []),
      fetchWithTimeout('https://oilprices.pk/api/price-history?product=LPG&limit=5000', 10000).then(r => r.json()).catch(() => [])
    ]);

    // Build previous price map from history (second-to-last entry = previous notification)
    const productHistories = {
      'Motor Spirit (Petrol)': petrolHist,
      'High Speed Diesel (HSD)': dieselHist,
      'Superior Kerosene Oil (SKO)': keroseneHist,
      'Liquefied Petroleum Gas (LPG)': lpgHist
    };

    // Add previousPrice and change to each product
    data.products = data.products.map(p => {
      const hist = productHistories[p.product];
      if (hist && hist.length >= 2) {
        const prev = hist[hist.length - 2];
        const prevPrice = prev.pricePkr;
        const change = p.pricePkr - prevPrice;
        const pct = prevPrice > 0 ? ((change / prevPrice) * 100) : 0;
        return {
          ...p,
          previousPrice: prevPrice,
          previousDate: prev.effectiveDate,
          change: parseFloat(change.toFixed(2)),
          changePct: parseFloat(pct.toFixed(2))
        };
      }
      return p;
    });

    // Also add OGRA notification date info for the banner
    const lastPetrolHist = petrolHist && petrolHist.length > 0 ? petrolHist[petrolHist.length - 1] : null;
    if (lastPetrolHist) {
      data.ograNotificationDate = lastPetrolHist.effectiveDate;
    }

    data.hiOctane = {};

    // Add PSO Hi-Octane
    if (psoOctane && psoOctane.price) {
      data.hiOctane.pso = {
        name: 'PSO Octane+ Euro 5',
        price: psoOctane.price,
        unit: 'litre',
        cities: psoOctane.cities,
        effectiveDate: psoOctane.effectiveDate
      };
      console.log('PSO Octane price:', psoOctane.price);
    }

    // Add APL XTRON
    if (aplXtron && aplXtron.priceTiers && aplXtron.priceTiers.length > 0) {
      data.hiOctane.apl = {
        name: 'Attock XTRON',
        priceTiers: aplXtron.priceTiers,
        totalStations: aplXtron.totalStations,
        effectiveDate: aplXtron.effectiveDate
      };
      console.log('APL XTRON prices:', aplXtron.priceTiers.map(t => `Rs${t.price} (${t.count} stations)`).join(', '));
    }

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

    const resp = await fetchWithTimeout('https://oilprices.pk/api/price-history?product=Petrol&limit=5000', 15000);
    const petrolData = await resp.json();

    const resp2 = await fetchWithTimeout('https://oilprices.pk/api/price-history?product=Diesel&limit=5000', 15000);
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

    const resp = await fetchWithTimeout('https://eklitre.pk/data/notified-prices.json', 15000);
    const raw = await resp.json();
    const notifs = raw.notifications || [];

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

    const resp = await fetchWithTimeout('https://worldoilmonitor.com/download.php?dataset=history&format=json', 15000);
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