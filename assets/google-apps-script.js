/**
 * CreatorLoop™ — Blueprint Downloader List
 * Google Apps Script Web App
 *
 * Sheet: Blueprint Downloader List
 * URL: https://docs.google.com/spreadsheets/d/1j1HwTurEToRQ3HHsr6iGjAfUmxkZQ3rUZ61ogKilwk4/edit
 *
 * DEPLOYMENT INSTRUCTIONS (one-time setup):
 * 1. Open the Google Sheet above
 * 2. Click Extensions → Apps Script
 * 3. Delete any existing code in the editor
 * 4. Paste this entire file into the editor
 * 5. Click Save (floppy disk icon)
 * 6. Click Deploy → New deployment
 * 7. Click the gear icon next to "Type" → Select "Web app"
 * 8. Set:
 *      Description: Blueprint Downloader v1
 *      Execute as: Me (your Google account)
 *      Who has access: Anyone
 * 9. Click Deploy → Authorize access → Allow
 * 10. Copy the Web App URL (looks like: https://script.google.com/macros/s/AKfycb.../exec)
 * 11. In the CreatorLoop website, add this to the <head> of blueprint.html BEFORE analytics.js:
 *       <script>
 *         window.CL_CONFIG = window.CL_CONFIG || {};
 *         window.CL_CONFIG.sheetUrl = 'PASTE_YOUR_WEB_APP_URL_HERE';
 *       </script>
 * 12. Push to GitHub — Cloudflare will auto-deploy
 *
 * COLUMN HEADERS (auto-created on first submission):
 * Timestamp | First Name | Last Name | Email | Company | Creator Type |
 * Download Source | UTM Source | UTM Medium | UTM Campaign |
 * GA4 Client ID | Blueprint Version | Status | Notes
 */

const SHEET_NAME = 'Blueprint Downloader List';
const HEADERS = [
  'Timestamp',
  'First Name',
  'Last Name',
  'Email',
  'Company',
  'Creator Type',
  'Download Source',
  'UTM Source',
  'UTM Medium',
  'UTM Campaign',
  'GA4 Client ID',
  'Blueprint Version',
  'Status',
  'Notes',
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    appendRow(data);
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Error in doPost: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Also support GET requests for testing
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'CreatorLoop Blueprint Sheet — Active', timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendRow(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  // Create the sheet and add headers if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    // Style the header row
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#1a1a1a');
    headerRange.setFontColor('#C8A84B');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    // Set column widths
    sheet.setColumnWidth(1, 180);  // Timestamp
    sheet.setColumnWidth(2, 120);  // First Name
    sheet.setColumnWidth(3, 120);  // Last Name
    sheet.setColumnWidth(4, 220);  // Email
    sheet.setColumnWidth(5, 160);  // Company
    sheet.setColumnWidth(6, 160);  // Creator Type
    sheet.setColumnWidth(7, 200);  // Download Source
    sheet.setColumnWidth(8, 130);  // UTM Source
    sheet.setColumnWidth(9, 130);  // UTM Medium
    sheet.setColumnWidth(10, 160); // UTM Campaign
    sheet.setColumnWidth(11, 200); // GA4 Client ID
    sheet.setColumnWidth(12, 140); // Blueprint Version
    sheet.setColumnWidth(13, 100); // Status
    sheet.setColumnWidth(14, 200); // Notes
  }

  // Ensure headers exist if sheet was created externally
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }

  const row = [
    data.timestamp        || new Date().toISOString(),
    data.firstName        || '',
    data.lastName         || '',
    data.email            || '',
    data.company          || '',
    data.creatorType      || '',
    data.downloadSource   || 'Blueprint Page',
    data.utmSource        || '',
    data.utmMedium        || '',
    data.utmCampaign      || '',
    data.gaClientId       || '',
    data.blueprintVersion || 'v3',
    'New',                // Status — default
    '',                   // Notes — empty
  ];

  sheet.appendRow(row);

  // Alternate row shading for readability
  const lastRow = sheet.getLastRow();
  if (lastRow % 2 === 0) {
    sheet.getRange(lastRow, 1, 1, HEADERS.length).setBackground('#f9f9f9');
  }
}
