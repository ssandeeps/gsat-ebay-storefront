/**
 * Google Sheets helper
 * --------------------
 * Reads live inventory data (Make, Product Name, Quantity — columns B, C, F)
 * from a private Google Sheet using a service account.
 *
 * The sheet must be shared with the service account's client_email as Viewer.
 */

const { google } = require('googleapis');
const path = require('path');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_GID = process.env.GOOGLE_SHEET_GID; // the gid= number from the sheet URL, identifies the exact tab
const CREDENTIALS_PATH =
  process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, '..', 'credentials', 'service-account.json');
const CACHE_MINUTES = parseInt(process.env.SHEET_CACHE_MINUTES || '10', 10);

let cache = { data: null, timestamp: 0 };

function isFresh(timestamp) {
  return Date.now() - timestamp < CACHE_MINUTES * 60 * 1000;
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/** Finds the tab title matching the gid from the sheet's URL, so renamed tabs still work */
async function resolveSheetTitle(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const targetGid = SHEET_GID ? parseInt(SHEET_GID, 10) : null;

  const match = targetGid
    ? meta.data.sheets.find((s) => s.properties.sheetId === targetGid)
    : meta.data.sheets[0]; // fallback: first tab

  if (!match) throw new Error(`Could not find a sheet tab matching gid=${SHEET_GID}`);
  return match.properties.title;
}

/** Returns live inventory rows: [{ make, productName, quantity }, ...] */
async function getInventory() {
  if (cache.data && isFresh(cache.timestamp)) {
    return cache.data;
  }

  if (!SPREADSHEET_ID) {
    throw new Error('Missing GOOGLE_SHEET_ID. Add it to your .env');
  }

  const sheets = await getSheetsClient();
  const sheetTitle = await resolveSheetTitle(sheets);

  // Columns B through F — we only use B, C, and F, but the range must be contiguous
  const range = `${sheetTitle}!B:F`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];

  // Assume row 1 is a header row — skip it
  const dataRows = rows.slice(1);

  const inventory = dataRows
    .map((row) => ({
      make: row[0] || '',        // column B = Make
      productName: row[1] || '', // column C = #Part num
      recvQuantity: row[2] || '', // column D = Recv (hidden — not shown on site)
      outQuantity: row[3] || '',  // column E = OUT (hidden — not shown on site)
      quantity: row[4] || '',     // column F = Avail = Recv - OUT (shown on site)
    }))
    .filter((item) => item.productName); // skip blank rows

  cache = { data: inventory, timestamp: Date.now() };
  return inventory;
}

module.exports = { getInventory };
