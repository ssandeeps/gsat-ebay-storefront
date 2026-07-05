# G-SAT International — eBay Storefront

A server-rendered storefront that pulls your live eBay listings (images, full descriptions, real-time stock) into SEO-friendly pages that match an ecommerce-style layout — for gsatinternational.com.

## ⚠️ Security first

Revoke the token shown in your earlier screenshot and generate a **new** one from eBay's "Get a User Token" page. Put the new token only in `.env` on your server — never in any file that reaches the browser.

## Why server-rendered (not just JavaScript)

Search engines need to see your product titles, prices, descriptions, and images directly in the page's HTML — not loaded in afterward by JavaScript. This app renders full HTML pages on the server for every listing, with:

- Unique `<title>` and meta description per product
- Open Graph tags (nice previews when shared)
- `Product` structured data (schema.org) — price, availability, images — which can make you eligible for Google's rich results (star ratings, price, stock shown in search)
- A real `/sitemap.xml` listing every product URL, generated automatically from your live listings
- Clean URLs like `/products/plc-module-siemens-s7-1200-123456789012`

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
- `EBAY_USER_TOKEN` — your new token
- `SITE_URL` — `https://www.gsatinternational.com` (used to build canonical URLs & sitemap)

```bash
npm start
```

Visit `http://localhost:3001` — you'll see your live listings grid; click into any item for its full product page.

## Pages

| URL | What it shows |
|---|---|
| `/` | Grid of all active listings |
| `/products/:slug` | Full product page: gallery, description, live stock, specifics |
| `/sitemap.xml` | Auto-generated sitemap for search engines |
| `/api/listings` | Raw JSON, if you want to build extra widgets elsewhere on the site |

## Putting this live on gsatinternational.com

Since this needs a Node.js process running (not just static files), you have two realistic paths:

**Option A — Reverse proxy (recommended if you're on your own server/VPS)**
Run this app on the same server as your site (e.g. `pm2 start server.js`), then configure your web server (Nginx/Apache) to proxy a path like `/shop` to `localhost:3001`, so it appears seamlessly as part of gsatinternational.com.

**Option B — Deploy separately, link to it**
Deploy this app to a Node-friendly host (Render, Railway, Fly.io) and link to it from your main site's menu (e.g. `shop.gsatinternational.com` as a subdomain pointed at the deployed app). Simpler to set up, still fully SEO-indexable since it's real server-rendered HTML on a real domain.

If your current site is on shared hosting/cPanel without Node support, Option B is the easier starting point — I can walk through DNS + deployment steps once you pick a host.

## Notes on data

- Listings and product details are cached in memory for `CACHE_MINUTES` (default 15) so pages stay fast and you don't hit eBay's API rate limits.
- Product descriptions come from eBay as the raw HTML you wrote in your listing — they're rendered as-is, since it's your own content.
- `itemCondition` in the structured data defaults to "Used" (common for parts listings) — adjust in `views/product.ejs` if your items are new.
