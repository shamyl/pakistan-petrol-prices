// ===== Pakistan Petrol Prices Dashboard =====

let pakistanChart = null;
let globalChart = null;
let comparisonChart = null;
let yearlyChart = null;

let pakistanHistoryData = null;
let longHistoryData = null;
let globalHistoryData = null;
let latestData = null;

const COLORS = {
  petrol: '#ff6b35',
  diesel: '#4ecdc4',
  kerosene: '#ffe66d',
  lpg: '#a8e6cf',
  brent: '#6c5ce7',
  wti: '#fd79a8',
  natgas: '#fdcb6e',
  gasoline: '#00b894',
  grid: 'rgba(255,255,255,0.04)',
  text: '#7b8398',
  tooltip: 'rgba(18,24,41,0.95)',
  tooltipBorder: 'rgba(255,255,255,0.1)'
};

// ===== Chart.js Defaults =====
Chart.defaults.color = COLORS.text;
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.boxHeight = 12;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'circle';

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initRangeButtons();
  loadAllData();
});

// ===== Tabs =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // Resize charts when switching tabs
      setTimeout(() => {
        if (pakistanChart) pakistanChart.resize();
        if (globalChart) globalChart.resize();
        if (comparisonChart) comparisonChart.resize();
        if (yearlyChart) yearlyChart.resize();
      }, 50);
    });
  });
}

// ===== Range Buttons =====
function initRangeButtons() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.range-buttons');
      parent.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.dataset.range;
      const tab = btn.closest('.tab-content').id.replace('tab-', '');
      if (tab === 'pakistan') updatePakistanChart(range);
      if (tab === 'global') updateGlobalChart(range);
    });
  });
}

// ===== Data Loading =====
async function loadAllData() {
  try {
    // Use allSettled so one failed API doesn't kill the whole refresh
    const [latestResult, historyResult, longHistoryResult, globalResult] = await Promise.allSettled([
      fetch('/api/pakistan/latest').then(r => r.json()),
      fetch('/api/pakistan/history').then(r => r.json()),
      fetch('/api/pakistan/long-history').then(r => r.json()),
      fetch('/api/global/history').then(r => r.json())
    ]);

    // Only update data from successful fetches; keep old data for failed ones
    if (latestResult.status === 'fulfilled') {
      latestData = latestResult.value;
      renderPriceCards(latestResult.value);
      renderHiOctaneCards(latestResult.value);
    }
    if (historyResult.status === 'fulfilled') {
      pakistanHistoryData = historyResult.value;
    }
    if (longHistoryResult.status === 'fulfilled') {
      longHistoryData = longHistoryResult.value;
      renderYearlyAnalysis(longHistoryResult.value);
    }
    if (globalResult.status === 'fulfilled') {
      globalHistoryData = globalResult.value;
    }

    // Only re-render charts/sections that have their data available
    if (latestData && longHistoryData && globalHistoryData) {
      renderStatsBar(latestData, longHistoryData, globalHistoryData);
    }
    if (pakistanHistoryData) {
      initPakistanChart();
    }
    if (globalHistoryData) {
      initGlobalChart();
    }
    if (longHistoryData && globalHistoryData) {
      initComparisonChart(longHistoryData, globalHistoryData);
      initYearlyChart(longHistoryData);
    }

    // If everything failed and we have no data at all, show error
    if (!latestData && latestResult.status === 'rejected') {
      showError();
    }

    updateLastUpdated();
  } catch (err) {
    console.error('Failed to load data:', err);
    // Don't overwrite existing valid data on refresh failure
    if (!latestData) {
      showError();
    }
    updateLastUpdated();
  }
}

// ===== Price Cards =====
function renderPriceCards(data) {
  const products = {
    'Motor Spirit (Petrol)': { id: 'petrol', key: 'petrolPrice', changeId: 'petrolChange' },
    'High Speed Diesel (HSD)': { id: 'diesel', key: 'dieselPrice', changeId: 'dieselChange' },
    'Superior Kerosene Oil (SKO)': { id: 'kerosene', key: 'kerosenePrice', changeId: 'keroseneChange' },
    'Liquefied Petroleum Gas (LPG)': { id: 'lpg', key: 'lpgPrice', changeId: 'lpgChange' }
  };

  data.products.forEach(p => {
    const meta = products[p.product];
    if (!meta) return;
    document.getElementById(meta.key).textContent = p.pricePkr.toFixed(2);

    // Calculate change from history
    const histKey = meta.id === 'petrol' ? 'petrol' : meta.id === 'diesel' ? 'diesel' : meta.id === 'kerosene' ? 'kerosene' : null;
    if (histKey && pakistanHistoryData && pakistanHistoryData[histKey]) {
      const hist = pakistanHistoryData[histKey];
      if (hist.length >= 2) {
        const prev = hist[hist.length - 2];
        const curr = hist[hist.length - 1];
        const change = curr.pricePkr - prev.pricePkr;
        const pct = ((change / prev.pricePkr) * 100).toFixed(2);
        const el = document.getElementById(meta.changeId);
        if (change > 0) {
          el.textContent = `▲ +${change.toFixed(2)} (${pct}%)`;
          el.className = 'card-change up';
        } else if (change < 0) {
          el.textContent = `▼ ${change.toFixed(2)} (${pct}%)`;
          el.className = 'card-change down';
        } else {
          el.textContent = '— No change';
          el.className = 'card-change flat';
        }
      }
    } else if (meta.id === 'lpg') {
      const el = document.getElementById(meta.changeId);
      el.textContent = '—';
      el.className = 'card-change flat';
    }
  });

  document.getElementById('effectiveDate').textContent = formatDate(data.effectiveDate);
}

// ===== Hi-Octane Cards (by company) =====
function renderHiOctaneCards(data) {
  const container = document.getElementById('hiOctaneCards');
  if (!data.hiOctane) {
    container.innerHTML = '<div class="octane-loading">Hi-Octane prices unavailable</div>';
    return;
  }

  let html = '';

  // PSO
  if (data.hiOctane.pso) {
    const pso = data.hiOctane.pso;
    const cityCount = Object.keys(pso.cities || {}).length;
    html += `
      <div class="octane-company-card" data-company="pso">
        <div class="octane-company-name">PSO Octane+ Euro 5</div>
        <div class="octane-price-main">Rs ${parseFloat(pso.price).toFixed(2)}</div>
        <div class="octane-price-unit">PKR / litre · ${cityCount} cities</div>
        ${pso.effectiveDate ? `<div class="octane-effective">Effective: ${pso.effectiveDate}</div>` : ''}
        <div class="octane-note">Same price across all PSO stations nationwide.</div>
      </div>
    `;
  }

  // APL
  if (data.hiOctane.apl) {
    const apl = data.hiOctane.apl;
    const tiers = apl.priceTiers || [];
    html += `
      <div class="octane-company-card" data-company="apl">
        <div class="octane-company-name">Attock XTRON</div>
    `;
    if (tiers.length === 1) {
      html += `
        <div class="octane-price-main">Rs ${tiers[0].price.toFixed(2)}</div>
        <div class="octane-price-unit">PKR / litre · ${tiers[0].stationCount} stations</div>
      `;
    } else {
      html += `<div class="octane-price-main">Rs ${tiers[0].price.toFixed(2)}</div>`;
      html += `<div class="octane-price-unit">PKR / litre · from ${tiers[tiers.length-1].price.toFixed(2)}</div>`;
      html += '<div class="octane-price-tiers">';
      for (const t of tiers) {
        html += `
          <div class="octane-tier">
            <span class="octane-tier-price">Rs ${t.price.toFixed(2)}</span>
            <span class="octane-tier-info">${t.stationCount} stations · ${t.cities.slice(0,3).join(', ')}${t.cities.length > 3 ? '…' : ''}</span>
          </div>
        `;
      }
      html += '</div>';
    }
    html += apl.effectiveDate ? `<div class="octane-effective">Effective: ${apl.effectiveDate}</div>` : '';
    html += `<div class="octane-note">Price varies by region. ${apl.totalStations} stations sell XTRON nationwide.</div>`;
    html += '</div>';
  }

  // If neither available
  if (!data.hiOctane.pso && !data.hiOctane.apl) {
    html = '<div class="octane-loading">Unable to fetch Hi-Octane prices from PSO or APL.</div>';
  }

  container.innerHTML = html;
}

// ===== Stats Bar =====
function renderStatsBar(latest, longHistory, global) {
  // 1-year and 5-year change for petrol
  const currentPetrol = longHistory[longHistory.length - 1]?.petrol;
  
  if (currentPetrol && longHistory.length > 1) {
    const today = new Date(latest.effectiveDate);
    
    for (const years of [1, 5]) {
      const target = new Date(today);
      target.setFullYear(target.getFullYear() - years);
      const targetStr = target.toISOString().split('T')[0];
      
      // Find closest date
      let closest = null;
      let minDiff = Infinity;
      for (const r of longHistory) {
        if (r.petrol == null) continue;
        const diff = Math.abs(new Date(r.date) - target);
        if (diff < minDiff) { minDiff = diff; closest = r; }
      }
      
      if (closest) {
        const change = ((currentPetrol - closest.petrol) / closest.petrol * 100).toFixed(1);
        const el = document.getElementById(years === 1 ? 'oneYearChange' : 'fiveYearChange');
        const val = parseFloat(change);
        el.textContent = (val >= 0 ? '+' : '') + change + '%';
        el.style.color = val >= 0 ? 'var(--danger)' : 'var(--success)';
      }
    }
  }

  // Brent price
  if (global && global.series && global.series.brent) {
    const brent = global.series.brent;
    const latest = brent[brent.length - 1];
    if (latest) {
      document.getElementById('brentPrice').textContent = '$' + latest.value.toFixed(2);
    }
  }
}

// ===== Yearly Analysis =====
function renderYearlyAnalysis(longHistory) {
  if (!longHistory || longHistory.length === 0) return;
  
  const latest = longHistory[longHistory.length - 1];
  const currentPetrol = latest.petrol;
  const today = new Date(latest.date);
  let maxAbsChange = 0;
  const changes = [];

  for (let years = 1; years <= 5; years++) {
    const target = new Date(today);
    target.setFullYear(target.getFullYear() - years);
    
    let closest = null;
    let minDiff = Infinity;
    for (const r of longHistory) {
      if (r.petrol == null) continue;
      const diff = Math.abs(new Date(r.date) - target);
      if (diff < minDiff) { minDiff = diff; closest = r; }
    }
    
    const valueEl = document.getElementById(`yearly${years}Value`);
    const detailEl = document.getElementById(`yearly${years}Detail`);
    const barEl = document.getElementById(`yearly${years}Bar`);
    
    if (closest && currentPetrol != null) {
      const oldPrice = closest.petrol;
      const diff = currentPetrol - oldPrice;
      const pct = (diff / oldPrice * 100);
      changes.push(Math.abs(pct));
      if (Math.abs(diff) > maxAbsChange) maxAbsChange = Math.abs(diff);
      
      valueEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      valueEl.className = 'yearly-value ' + (pct >= 0 ? 'up' : 'down');
      
      detailEl.innerHTML = `From PKR ${oldPrice.toFixed(2)}<br>to PKR ${currentPetrol.toFixed(2)}<br><span style="color:var(--text-dim)">${formatDate(closest.date)} → ${formatDate(latest.date)}</span>`;
      
      barEl.className = 'yearly-bar-fill ' + (pct >= 0 ? 'up' : 'down');
    } else {
      valueEl.textContent = 'N/A';
      valueEl.className = 'yearly-value';
      detailEl.textContent = 'Data not available';
      changes.push(0);
    }
  }
  
  // Animate bars proportionally
  setTimeout(() => {
    const maxChange = Math.max(...changes, 1);
    for (let years = 1; years <= 5; years++) {
      const barEl = document.getElementById(`yearly${years}Bar`);
      const pct = (changes[years - 1] / maxChange) * 100;
      barEl.style.width = pct + '%';
    }
  }, 100);
}

// ===== Pakistan Chart =====
function initPakistanChart() {
  const ctx = document.getElementById('pakistanChart').getContext('2d');
  
  const data = preparePakistanData('3m');
  
  pakistanChart = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('PKR / litre')
  });
}

function preparePakistanData(range) {
  // Use long history for ranges > 2y, and oilprices.pk for shorter ranges
  let petrolData, dieselData;

  if (range === '3m' || range === '6m' || range === '1y' || range === '2y') {
    // Use oilprices.pk daily data
    const cutoff = getCutoffDate(range);
    petrolData = (pakistanHistoryData?.petrol || [])
      .filter(r => new Date(r.effectiveDate) >= cutoff)
      .map(r => ({ x: r.effectiveDate, y: r.pricePkr }));
    dieselData = (pakistanHistoryData?.diesel || [])
      .filter(r => new Date(r.effectiveDate) >= cutoff)
      .map(r => ({ x: r.effectiveDate, y: r.pricePkr }));
  } else {
    // Use eklitre long history (monthly notifications)
    const cutoff = getCutoffDate(range);
    petrolData = (longHistoryData || [])
      .filter(r => r.petrol != null && new Date(r.date) >= cutoff)
      .map(r => ({ x: r.date, y: r.petrol }));
    dieselData = (longHistoryData || [])
      .filter(r => r.diesel != null && new Date(r.date) >= cutoff)
      .map(r => ({ x: r.date, y: r.diesel }));
  }

  return {
    datasets: [
      {
        label: 'Petrol',
        data: petrolData,
        borderColor: COLORS.petrol,
        backgroundColor: hexToRgba(COLORS.petrol, 0.08),
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: COLORS.petrol,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      },
      {
        label: 'Diesel',
        data: dieselData,
        borderColor: COLORS.diesel,
        backgroundColor: hexToRgba(COLORS.diesel, 0.06),
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: COLORS.diesel,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }
    ]
  };
}

function updatePakistanChart(range) {
  if (!pakistanChart) return;
  const data = preparePakistanData(range);
  pakistanChart.data = data;
  pakistanChart.update('active');
}

// ===== Global Chart =====
function initGlobalChart() {
  const ctx = document.getElementById('globalChart').getContext('2d');
  const data = prepareGlobalData('1m');
  
  globalChart = new Chart(ctx, {
    type: 'line',
    data: data,
    options: getChartOptions('USD / barrel')
  });
}

function prepareGlobalData(range) {
  const series = globalHistoryData?.series || {};
  const cutoff = getCutoffDate(range);
  
  const wtiData = (series.wti || [])
    .filter(r => new Date(r.date) >= cutoff)
    .map(r => ({ x: r.date, y: r.value }));
  
  const brentData = (series.brent || [])
    .filter(r => new Date(r.date) >= cutoff)
    .map(r => ({ x: r.date, y: r.value }));

  return {
    datasets: [
      {
        label: 'Brent Crude',
        data: brentData,
        borderColor: COLORS.brent,
        backgroundColor: hexToRgba(COLORS.brent, 0.08),
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: COLORS.brent,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      },
      {
        label: 'WTI Crude',
        data: wtiData,
        borderColor: COLORS.wti,
        backgroundColor: hexToRgba(COLORS.wti, 0.06),
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: COLORS.wti,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }
    ]
  };
}

function updateGlobalChart(range) {
  if (!globalChart) return;
  const data = prepareGlobalData(range);
  globalChart.data = data;
  globalChart.update('active');
}

// ===== Comparison Chart =====
function initComparisonChart(pkHistory, globalHistory) {
  const ctx = document.getElementById('comparisonChart').getContext('2d');
  
  // Get last 2 years of data, normalized to 100
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  
  // Pakistan petrol - index to 100
  const pkData = (pkHistory || [])
    .filter(r => r.petrol != null && new Date(r.date) >= cutoff)
    .map(r => ({ x: r.date, y: r.petrol }));
  
  const brentData = (globalHistory?.series?.brent || [])
    .filter(r => new Date(r.date) >= cutoff)
    .map(r => ({ x: r.date, y: r.value }));
  
  // Normalize to 100
  if (pkData.length > 0) {
    const base = pkData[0].y;
    pkData.forEach(d => d.y = (d.y / base) * 100);
  }
  if (brentData.length > 0) {
    const base = brentData[0].y;
    brentData.forEach(d => d.y = (d.y / base) * 100);
  }
  
  comparisonChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Pakistan Petrol (PKR/litre, indexed)',
          data: pkData,
          borderColor: COLORS.petrol,
          backgroundColor: hexToRgba(COLORS.petrol, 0.08),
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: COLORS.petrol,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        },
        {
          label: 'Brent Crude (USD/bbl, indexed)',
          data: brentData,
          borderColor: COLORS.brent,
          backgroundColor: hexToRgba(COLORS.brent, 0.06),
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: COLORS.brent,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }
      ]
    },
    options: getChartOptions('Index (100 = start of period)')
  });
}

// ===== Yearly Chart =====
function initYearlyChart(longHistory) {
  const ctx = document.getElementById('yearlyChart').getContext('2d');
  
  const latest = longHistory[longHistory.length - 1];
  const currentPetrol = latest?.petrol;
  const today = new Date(latest?.date || new Date());
  
  const labels = [];
  const pkChanges = [];
  
  for (let years = 1; years <= 5; years++) {
    const target = new Date(today);
    target.setFullYear(target.getFullYear() - years);
    
    let closest = null;
    let minDiff = Infinity;
    for (const r of longHistory) {
      if (r.petrol == null) continue;
      const diff = Math.abs(new Date(r.date) - target);
      if (diff < minDiff) { minDiff = diff; closest = r; }
    }
    
    labels.push(years + 'Y');
    if (closest && currentPetrol != null) {
      const pct = ((currentPetrol - closest.petrol) / closest.petrol * 100);
      pkChanges.push(pct.toFixed(1));
    } else {
      pkChanges.push(0);
    }
  }
  
  // Also compute global (Brent) changes for same periods
  const brentSeries = globalHistoryData?.series?.brent || [];
  const globalChanges = [];
  for (let years = 1; years <= 5; years++) {
    const target = new Date(today);
    target.setFullYear(target.getFullYear() - years);
    
    let closest = null;
    let minDiff = Infinity;
    for (const r of brentSeries) {
      const diff = Math.abs(new Date(r.date) - target);
      if (diff < minDiff) { minDiff = diff; closest = r; }
    }
    
    const latestBrent = brentSeries[brentSeries.length - 1];
    if (closest && latestBrent) {
      const pct = ((latestBrent.value - closest.value) / closest.value * 100);
      globalChanges.push(pct.toFixed(1));
    } else {
      globalChanges.push(null);
    }
  }
  
  const yearlyData = {
    labels: labels,
    datasets: [
      {
        label: 'Pakistan Petrol (%)',
        data: pkChanges,
        backgroundColor: pkChanges.map(v => parseFloat(v) >= 0 ? hexToRgba(COLORS.petrol, 0.7) : hexToRgba(COLORS.success, 0.7)),
        borderColor: pkChanges.map(v => parseFloat(v) >= 0 ? COLORS.petrol : COLORS.success),
        borderWidth: 2,
        borderRadius: 8,
        barPercentage: 0.6
      },
      {
        label: 'Global Brent Crude (%)',
        data: globalChanges,
        backgroundColor: globalChanges.map(v => v === null ? 'transparent' : (parseFloat(v) >= 0 ? hexToRgba(COLORS.brent, 0.7) : hexToRgba(COLORS.success, 0.7))),
        borderColor: globalChanges.map(v => v === null ? 'transparent' : (parseFloat(v) >= 0 ? COLORS.brent : COLORS.success)),
        borderWidth: 2,
        borderRadius: 8,
        barPercentage: 0.6
      }
    ]
  };
  const yearlyOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'end' },
      tooltip: getTooltipConfig()
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLORS.text, font: { size: 13, weight: '600' } } },
      y: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.text, callback: v => v + '%' },
        title: { display: true, text: 'Price Change (%)', color: COLORS.text, font: { size: 11 } }
      }
    }
  };
  if (yearlyChart) {
    yearlyChart.data = yearlyData;
    yearlyChart.options = yearlyOpts;
    yearlyChart.update('none');
  } else {
    yearlyChart = new Chart(ctx, { type: 'bar', data: yearlyData, options: yearlyOpts });
  }
}

// ===== Helpers =====
function getCutoffDate(range) {
  const d = new Date();
  switch(range) {
    case '1m': d.setMonth(d.getMonth() - 1); break;
    case '3m': d.setMonth(d.getMonth() - 3); break;
    case '6m': d.setMonth(d.getMonth() - 6); break;
    case '1y': d.setFullYear(d.getFullYear() - 1); break;
    case '2y': d.setFullYear(d.getFullYear() - 2); break;
    case '5y': d.setFullYear(d.getFullYear() - 5); break;
    case 'all': return new Date('2006-01-01');
    default: d.setMonth(d.getMonth() - 3);
  }
  return d;
}

function getChartOptions(yAxisTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { color: COLORS.text, font: { size: 12 } }
      },
      tooltip: getTooltipConfig(yAxisTitle)
    },
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            day: 'MMM d',
            week: 'MMM d',
            month: 'MMM yyyy',
            year: 'yyyy'
          },
          tooltipFormat: 'MMM d, yyyy'
        },
        grid: { display: false },
        ticks: { color: COLORS.text, maxRotation: 0, autoSkipPadding: 30 }
      },
      y: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.text, callback: v => v.toLocaleString() },
        title: {
          display: !!yAxisTitle,
          text: yAxisTitle || '',
          color: COLORS.text,
          font: { size: 11 }
        }
      }
    }
  };
}

function getTooltipConfig(yAxisTitle) {
  return {
    backgroundColor: COLORS.tooltip,
    borderColor: COLORS.tooltipBorder,
    borderWidth: 1,
    titleColor: '#fff',
    bodyColor: '#e8ecf4',
    padding: 12,
    cornerRadius: 8,
    displayColors: true,
    boxPadding: 6,
    titleFont: { size: 13, weight: '600' },
    bodyFont: { size: 12 },
    callbacks: {
      label: function(ctx) {
        const val = ctx.parsed.y;
        const label = ctx.dataset.label;
        if (yAxisTitle && yAxisTitle.includes('Index')) {
          return label + ': ' + val.toFixed(1);
        }
        return label + ': ' + val.toFixed(2);
      }
    }
  };
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  const now = new Date();
  el.textContent = 'Updated ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' PKT';
}

function showError() {
  document.querySelectorAll('.card-value').forEach(el => el.textContent = 'Error');
  document.querySelectorAll('.card-change').forEach(el => { el.textContent = '—'; el.className = 'card-change flat'; });
}

// ===== Auto-refresh every 5 minutes =====
setInterval(() => {
  loadAllData();
}, 5 * 60 * 1000);