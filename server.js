/**
 * G-SAT International — eBay Storefront
 * --------------------------------------
 * Server-rendered pages (good for SEO) that pull live listings from eBay.
 *
 * Run:
 *   1. npm install
 *   2. cp .env.example .env  (fill in a FRESH eBay token + your site URL)
 *   3. npm start
 *   4. Visit http://localhost:3001
 */

require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const { getActiveListings, getItemDetail } = require('./lib/ebay');
const { getInventory } = require('./lib/sheets');

const app = express();
app.use(compression());
app.use(cors()); // allows gsatinternational.com (or any site) to call /api/inventory
app.set('view engine', 'ejs');
app.use('/static', express.static('public'));

const SITE_URL = (process.env.SITE_URL || 'http://localhost:3001').replace(/\/$/, '');
const PORT = process.env.PORT || 3001;

// ---- Storefront: listings grid ----
app.get('/', async (req, res) => {
  try {
    const listings = await getActiveListings();
    res.render('index', {
      listings,
      siteUrl: SITE_URL,
      pageTitle: 'Shop Our Parts on eBay | G-SAT International',
      pageDescription:
        'Browse G-SAT International\'s live eBay inventory of industrial automation parts — in stock and ready to ship.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not load listings. Check server logs and your .env token.');
  }
});

// ---- Individual product page: /products/some-title-123456789012 ----
app.get('/products/:slug', async (req, res) => {
  try {
    const match = req.params.slug.match(/(\d{9,})$/); // itemId is the trailing digits
    const itemId = match ? match[1] : null;

    if (!itemId) return res.status(404).send('Product not found');

    const item = await getItemDetail(itemId);
    if (!item) return res.status(404).send('Product not found');

    res.render('product', {
      item,
      siteUrl: SITE_URL,
      pageTitle: `${item.title} | G-SAT International`,
      pageDescription: item.description
        ? item.description.replace(/<[^>]+>/g, '').slice(0, 155)
        : `${item.title} — in stock now at G-SAT International.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not load product. Check server logs.');
  }
});

// ---- JSON endpoint: live inventory data (Make, Product Name, Quantity) ----
// Public and read-only — safe to call from gsatinternational.com's static pages.
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await getInventory();
    res.json({ count: items.length, items, updatedNote: 'Live from Google Sheet' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load inventory', message: err.message });
  }
});

// ---- Live inventory page, sourced from a private Google Sheet ----
app.get('/inventory', async (req, res) => {
  try {
    const items = await getInventory();
    res.render('inventory', {
      items,
      siteUrl: SITE_URL,
      pageTitle: 'Live Inventory | G-SAT International',
      pageDescription: 'Live stock levels updated daily from our internal inventory.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not load inventory. Check server logs and your .env / credentials.');
  }
});

// ---- JSON endpoint (optional — for AJAX stock refresh widgets elsewhere on your site) ----
app.get('/api/listings', async (req, res) => {
  try {
    const listings = await getActiveListings();
    res.json({ count: listings.length, listings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Sitemap for SEO ----
app.get('/sitemap.xml', async (req, res) => {
  try {
    const listings = await getActiveListings();
    const urls = [
      `${SITE_URL}/`,
      ...listings.map((l) => `${SITE_URL}/products/${l.slug}`),
    ];

    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`);
  } catch (err) {
    res.status(500).send('Could not generate sitemap');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Storefront running at http://localhost:${PORT}`);
});
