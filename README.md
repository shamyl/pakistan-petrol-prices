# Pakistan Petrol Prices Dashboard

Live daily petrol price dashboard for Pakistan with historical charts and global oil price comparisons.

## Data Sources
- **[OilPrices.pk](https://oilprices.pk)** — Real-time OGRA-notified prices (CC BY 4.0)
- **[ekLitre.pk](https://eklitre.pk/data/)** — Historical fuel prices since 2006 (CC BY 4.0)
- **[OGRA](https://www.ogra.org.pk)** — Oil & Gas Regulatory Authority of Pakistan
- **[World Oil Monitor](https://worldoilmonitor.com)** — Global WTI & Brent crude oil prices (EIA data)

## Features
- Live price cards for Petrol, Diesel, Kerosene, and LPG
- Historical price charts with selectable time ranges (3M to All-time)
- Global crude oil price tracking (Brent & WTI)
- Pakistan vs Global comparison chart (normalized index)
- 1-5 year yearly price change analysis with bar charts
- Auto-refreshes every 5 minutes
- Fully responsive design

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla JS + Chart.js
- **Hosting:** Railway

## Development
```bash
npm install
npm start
```

## License
Data is sourced under CC BY 4.0 from OilPrices.pk and ekLitre.pk.
Code is © Shamyl Mansoor.