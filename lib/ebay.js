/**
 * eBay Trading API helper
 * -----------------------
 * All calls to eBay happen here, server-side only, using the token from .env.
 * Results are cached in memory for CACHE_MINUTES to avoid hammering eBay's API
 * and to keep pages fast for both users and search engine crawlers.
 */

const fetch = require('node-fetch');
const xml2js = require('xml2js');
const slugify = require('slugify');

const EBAY_USER_TOKEN = process.env.EBAY_USER_TOKEN;
const EBAY_API_URL = process.env.EBAY_API_URL || 'https://api.ebay.com/ws/api.dll';
const EBAY_SITE_ID = process.env.EBAY_SITE_ID || '0';
const CACHE_MINUTES = parseInt(process.env.CACHE_MINUTES || '15', 10);

let listCache = { data: null, timestamp: 0 };
const detailCache = new Map(); // itemId -> { data, timestamp }

function isFresh(timestamp) {
  return Date.now() - timestamp < CACHE_MINUTES * 60 * 1000;
}

async function callEbay(callName, xmlBody) {
  if (!EBAY_USER_TOKEN || EBAY_USER_TOKEN === 'your_token_here') {
    throw new Error('Missing EBAY_USER_TOKEN. Add your real token to .env');
  }

  const response = await fetch(EBAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-SITEID': EBAY_SITE_ID,
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
    },
    body: xmlBody,
  });

  const xmlText = await response.text();
  return xml2js.parseStringPromise(xmlText, { explicitArray: false });
}

function makeSlug(title, itemId) {
  return `${slugify(title || 'item', { lower: true, strict: true })}-${itemId}`;
}

function mapItemSummary(item) {
  const images = [];
  if (item.PictureDetails?.GalleryURL) images.push(item.PictureDetails.GalleryURL);
  if (item.PictureDetails?.PictureURL) {
    const pics = Array.isArray(item.PictureDetails.PictureURL)
      ? item.PictureDetails.PictureURL
      : [item.PictureDetails.PictureURL];
    pics.forEach((p) => {
      if (!images.includes(p)) images.push(p);
    });
  }

  return {
    itemId: item.ItemID,
    title: item.Title,
    slug: makeSlug(item.Title, item.ItemID),
    price: item.SellingStatus?.CurrentPrice?._ ?? item.SellingStatus?.CurrentPrice,
    currency: item.SellingStatus?.CurrentPrice?.$?.currencyID || 'USD',
    quantity: item.Quantity,
    quantitySold: item.SellingStatus?.QuantitySold ?? 0,
    image: images[0] || null,
    images,
    viewItemURL: item.ListingDetails?.ViewItemURL,
    endTime: item.ListingDetails?.EndTime,
    condition: item.ConditionDisplayName,
    location: item.Location,
  };
}

/** Fetch all active listings (cached) — used for the storefront grid + sitemap */
async function getActiveListings() {
  if (listCache.data && isFresh(listCache.timestamp)) {
    return listCache.data;
  }

  const allItems = [];
  let page = 1;
  let totalPages = 1;

  do {
    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${EBAY_USER_TOKEN}</eBayAuthToken></RequesterCredentials>
  <ActiveList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>100</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`;

    const parsed = await callEbay('GetMyeBaySelling', xmlBody);
    const result = parsed.GetMyeBaySellingResponse;

    if (result?.Ack === 'Failure') {
      throw new Error(JSON.stringify(result.Errors));
    }

    const items = result?.ActiveList?.ItemArray?.Item;
    const itemList = Array.isArray(items) ? items : items ? [items] : [];
    allItems.push(...itemList);

    const pagination = result?.ActiveList?.PaginationResult;
    totalPages = pagination ? parseInt(pagination.TotalNumberOfPages || '1', 10) : 1;
    page++;
  } while (page <= totalPages);

  const listings = allItems.map(mapItemSummary);

  listCache = { data: listings, timestamp: Date.now() };
  return listings;
}

/** Fetch full detail (description, all images, live stock) for one item — used for product pages */
async function getItemDetail(itemId) {
  const cached = detailCache.get(itemId);
  if (cached && isFresh(cached.timestamp)) {
    return cached.data;
  }

  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${EBAY_USER_TOKEN}</eBayAuthToken></RequesterCredentials>
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;

  const parsed = await callEbay('GetItem', xmlBody);
  const result = parsed.GetItemResponse;

  if (result?.Ack === 'Failure') {
    return null;
  }

  const item = result.Item;
  const summary = mapItemSummary(item);

  let specifics = [];
  if (item.ItemSpecifics?.NameValueList) {
    const list = Array.isArray(item.ItemSpecifics.NameValueList)
      ? item.ItemSpecifics.NameValueList
      : [item.ItemSpecifics.NameValueList];
    specifics = list.map((s) => ({ name: s.Name, value: s.Value }));
  }

  const detail = {
    ...summary,
    description: item.Description || '',
    specifics,
    quantityAvailable: (parseInt(item.Quantity || '0', 10) || 0) - (parseInt(item.SellingStatus?.QuantitySold || '0', 10) || 0),
  };

  detailCache.set(itemId, { data: detail, timestamp: Date.now() });
  return detail;
}

module.exports = { getActiveListings, getItemDetail, makeSlug };
