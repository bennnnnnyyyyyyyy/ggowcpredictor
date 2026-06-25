// Firebase Utility Functions
// Helper methods for interacting with Firebase Firestore via REST API

const FIREBASE_PROJECT = "ggowcpredictor";
const FIREBASE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

/**
 * Get all fixtures from Firebase
 * @returns {Promise<Array>} Array of fixture documents
 */
function firebaseGetFixtures() {
  try {
    const url = `${FIREBASE_BASE_URL}/fixtures`;
    const options = {
      method: "get",
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    
    return parseFirebaseDocuments(data.documents || []);
  } catch (error) {
    Logger.log("Error fetching fixtures: " + error.toString());
    return [];
  }
}

/**
 * Get completed match results from Firebase
 * @returns {Promise<Array>} Array of result documents
 */
function firebaseGetResults() {
  try {
    const url = `${FIREBASE_BASE_URL}/results`;
    const options = {
      method: "get",
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    
    return parseFirebaseDocuments(data.documents || []);
  } catch (error) {
    Logger.log("Error fetching results: " + error.toString());
    return [];
  }
}

/**
 * Get all player predictions from Firebase
 * @param {string} playerId - Optional: filter by player ID
 * @returns {Promise<Array>} Array of prediction documents
 */
function firebaseGetPredictions(playerId = null) {
  try {
    const url = `${FIREBASE_BASE_URL}/predictions`;
    const options = {
      method: "get",
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    
    let predictions = parseFirebaseDocuments(data.documents || []);
    
    if (playerId) {
      predictions = predictions.filter(p => p.playerId === playerId);
    }
    
    return predictions;
  } catch (error) {
    Logger.log("Error fetching predictions: " + error.toString());
    return [];
  }
}

/**
 * Save fixture to Firebase
 * @param {Object} fixture - Fixture object to save
 * @returns {boolean} Success status
 */
function firebaseSaveFixture(fixture) {
  try {
    const docId = `match_${fixture.matchId}`;
    const url = `${FIREBASE_BASE_URL}/fixtures/${docId}`;
    
    const payload = convertToFirebaseDocument(fixture);
    
    const options = {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    return response.getResponseCode() === 200;
  } catch (error) {
    Logger.log("Error saving fixture: " + error.toString());
    return false;
  }
}

/**
 * Save match result to Firebase
 * @param {Object} result - Result object to save
 * @returns {boolean} Success status
 */
function firebaseSaveResult(result) {
  try {
    const docId = `match_${result.matchId}`;
    const url = `${FIREBASE_BASE_URL}/results/${docId}`;
    
    const payload = convertToFirebaseDocument(result);
    
    const options = {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    return response.getResponseCode() === 200;
  } catch (error) {
    Logger.log("Error saving result: " + error.toString());
    return false;
  }
}

/**
 * Update leaderboard entry in Firebase
 * @param {Object} leaderboardEntry - Leaderboard entry to save
 * @returns {boolean} Success status
 */
function firebaseSaveLeaderboardEntry(leaderboardEntry) {
  try {
    const docId = leaderboardEntry.playerId;
    const url = `${FIREBASE_BASE_URL}/leaderboard/${docId}`;
    
    const payload = convertToFirebaseDocument(leaderboardEntry);
    
    const options = {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    return response.getResponseCode() === 200;
  } catch (error) {
    Logger.log("Error saving leaderboard entry: " + error.toString());
    return false;
  }
}

/**
 * Convert JavaScript object to Firebase document format
 * Firestore uses a specific format for values
 * @param {Object} obj - JavaScript object
 * @returns {Object} Firebase formatted document
 */
function convertToFirebaseDocument(obj) {
  const fields = {};
  
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = convertToFirebaseValue(value);
  }
  
  return { fields };
}

/**
 * Convert a value to Firebase value format
 * @param {*} value - Any JavaScript value
 * @returns {Object} Firebase formatted value
 */
function convertToFirebaseValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  
  if (typeof value === "string") {
    return { stringValue: value };
  }
  
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(v => convertToFirebaseValue(v))
      }
    };
  }
  
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: (() => {
          const mapFields = {};
          for (const [k, v] of Object.entries(value)) {
            mapFields[k] = convertToFirebaseValue(v);
          }
          return mapFields;
        })()
      }
    };
  }
  
  return { stringValue: String(value) };
}

/**
 * Parse Firebase documents into plain JavaScript objects
 * @param {Array} documents - Array of Firebase document objects
 * @returns {Array} Array of plain JavaScript objects
 */
function parseFirebaseDocuments(documents) {
  return documents.map(doc => {
    const obj = {
      id: doc.name.split("/").pop() // Extract document ID
    };
    
    if (doc.fields) {
      for (const [key, value] of Object.entries(doc.fields)) {
        obj[key] = parseFirebaseValue(value);
      }
    }
    
    return obj;
  });
}

/**
 * Parse a Firebase value into a plain JavaScript value
 * @param {Object} value - Firebase formatted value
 * @returns {*} JavaScript value
 */
function parseFirebaseValue(value) {
  if (value.nullValue !== undefined) {
    return null;
  }
  
  if (value.booleanValue !== undefined) {
    return value.booleanValue;
  }
  
  if (value.integerValue !== undefined) {
    return parseInt(value.integerValue);
  }
  
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  
  if (value.timestampValue !== undefined) {
    return new Date(value.timestampValue);
  }
  
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(v => parseFirebaseValue(v));
  }
  
  if (value.mapValue !== undefined) {
    const obj = {};
    for (const [key, val] of Object.entries(value.mapValue.fields || {})) {
      obj[key] = parseFirebaseValue(val);
    }
    return obj;
  }
  
  return value;
}

/**
 * Test Firebase connectivity
 * @returns {Object} Test results
 */
function testFirebaseConnection() {
  try {
    const testUrl = `${FIREBASE_BASE_URL}`;
    const options = {
      method: "get",
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(testUrl, options);
    
    return {
      connected: response.getResponseCode() === 200,
      statusCode: response.getResponseCode(),
      message: response.getResponseCode() === 200 ? "Connected" : "Connection failed"
    };
  } catch (error) {
    return {
      connected: false,
      error: error.toString()
    };
  }
}
