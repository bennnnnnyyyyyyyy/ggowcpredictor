/**
 * Writes a full snapshot collection to the Google Sheets backup.
 * @param {string} tabName The name of the collection tab.
 * @param {Array<Object>} dataObjects Array of canonical database objects.
 */
function writeToSheetBackup(tabName, dataObjects) {
  try {
    const ss = SpreadsheetApp.openById(firebaseConfig.spreadsheetBackupId);
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }

    sheet.clearContents();
    if (!dataObjects || dataObjects.length === 0) return;

    // Establish predictable keys based on canonical schemas
    const headers = Object.keys(dataObjects[0]);
    sheet.appendRow(headers);

    const rows = dataObjects.map((obj) =>
      headers.map((key) => {
        const val = obj[key];
        // Convert timestamps or nested elements cleanly to strings/primitives
        return val instanceof Date
          ? val.toISOString()
          : val !== null
            ? val
            : "";
      }),
    );

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    Logger.log(
      `[BACKUP-WRITE] successfully backed up ${rows.length} rows to tab: ${tabName}`,
    );
  } catch (err) {
    Logger.log(
      `[BACKUP-ERROR] Failed to write to spreadsheet backup: ` + err.toString(),
    );
  }
}

/**
 * Reads a backup collection from the spreadsheet and parses rows into identical objects.
 * @param {string} tabName The name of the collection tab.
 * @return {Array<Object>} Normalized object records matching the schema fields.
 */
function fetchSheetBackupCollection(tabName) {
  try {
    const ss = SpreadsheetApp.openById(firebaseConfig.spreadsheetBackupId);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // Empty or headers only

    const headers = data[0];
    const rows = data.slice(1);

    return rows.map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        let val = row[index];
        if (val === "") val = null;
        record[header] = val;
      });
      return record;
    });
  } catch (err) {
    Logger.log(
      `[BACKUP-ERROR] Failed to read from spreadsheet backup: ` +
        err.toString(),
    );
    return [];
  }
}
