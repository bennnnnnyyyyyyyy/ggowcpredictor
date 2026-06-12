// Google Apps Script Email Utilities
// Fetches users from Firestore and sends launch emails using Gmail/MailApp service

const emailList = [
  "jana.cooper.wiz@gmail.com",
  "katherine.adams.wiz@gmail.com",
  "sam.richards.wiz@gmail.com",
  "anna.nelson.wiz@gmail.com",
  "steven.adams.wiz@gmail.com",
  "STEVE.WINCHESTER.WIZ@gmail.com",
  "celine.dami.wiz@gmail.com",
  "monika.miller.wiz@gmail.com",
  "HEAVEN.DAVIS.WIZ@gmail.com",
  "maddy.snow.wiz@gmail.com",
  "blake.hunter.wiz@gmail.com",
  "jules.brown.wiz@gmail.com",
  "mary.miller.wiz@gmail.com",
  "ben.camel.wiz@gmail.com",
  "lizfoxwiz97@gmail.com",
  "michael.morgan.wiz@gmail.com",
  "bella.cameron.wiz@gmail.com",
  "oscar.kamel.wiz@gmail.com",
  "marcy.miller.wiz@gmail.com",
  "demon.smith.wiz@gmail.com",
  "ivy.bennett.wiz@gmail.com",
  "david.green.wiz@gmail.com",
  "haley.roberson.wiz@gmail.com",
  "donna.bell.wiz@gmail.com",
  "laura.miller.wiz@gmail.com",
  "luke.grant.wiz@gmail.com",
  "riley.miller.wiz@gmail.com",
  "stewart.martin.wiz@gmail.com",
  "jessie.moore.wiz@gmail.com",
  "grace.smith.wiz@gmail.com",
  "josh.adams.wiz@gmail.com",
  "natalie.wilson.wiz@gmail.com",
  "roben.neves.wiz@gmail.com",
  "mia.cooper.wiz@gmail.com",
  "dexter.lane.wiz@gmail.com",
  "leon.smith.wiz@gmail.com",
  "jane.white.wizz@gmail.com",
  "brodie.armin.wiz@gmail.com",
  "lori.anderson.wiz@gmail.com",
  "olivia.black.wiz@gmail.com",
  "iris.brown.wiz@gmail.com",
  "tonny.smith.wiz@gmail.com",
  "adam.white.wiz@gmail.com",
  "daisy.parker.wiz@gmail.com",
  "phoebe.brown.wiz@gmail.com",
  "melanie.brown.wiz@gmail.com",
  "jeremy.welson.wiz@gmail.com",
  "frank.clarkson.wiz@gmail.com",
  "rickk.nelson.wiz@gmail.com",
  "rose.simon.wiz@gmail.com",
  "alex.woods.wiz@gmail.com",
  "nora.atkins.wiz@gmail.com",
  "nova.grace.wiz@gmail.com",
  "hope.smith.wiz@gmail.com",
  "caroline.richards.wiz@gmail.com",
  "jasmine.green.wiz@gmail.com",
  "tim.miller.wiz@gmail.com",
  "cobe.jones.wiz@gmail.com",
  "ray.parker.wiz@gmail.com",
  "eva.christian.wiz@gmail.com",
  "john.williams.wiz@gmail.com",
  "norman.clarke.wiz@gmail.com",
  "jason.foster.wiz@gmail.com",
  "matt.walter.wiz@gmail.com",
  "jasmine.arthur.wiz@gmail.com",
  "ashly.murphy.wiz@gmail.com",
  "joey.milner.wiz@gmail.com",
  "jordan.kelly00.wiz@gmail.com",
  "mavis.miller.wiz@gmail.com",
  "jack.ethann.wiz@gmail.com",
  "andrew.cooper.wiz@gmail.com",
  "peter.smith.wiz@gmail.com",
  "grant.holden.wiz@gmail.com",
  "chris.johnson.wiz@gmail.com",
  "mike.woods.wiz@gmail.com",
  "ianstraange@gmail.com",
  "joseph.brown.wiz@gmail.com",
  "karenjacksonwiz@gmail.com",
  "thomas.smith.wiz@gmail.com",
  "hazel.white.wiz@gmail.com",
  "russ.dami.wiz@gmail.com",
  "william.white.wiz@gmail.com",
  "ben.arthur.wiz@gmail.com",
  "jimmy.pearson.wiz@gmail.com",
  "selene.myles.wiz@gmail.com",
  "kaity.james.wiz@gmail.com"
];

function getEmailForUsername(username) {
  const norm = username.toLowerCase().replace(/_/g, ".");
  const custom = {
    "jane": "jana.cooper.wiz@gmail.com",
    "jimmy": "jimmy.pearson.wiz@gmail.com",
    "selene": "selene.myles.wiz@gmail.com",
    "ashley.murphy": "ashly.murphy.wiz@gmail.com",
    "ian.strange": "ianstraange@gmail.com",
    "jack.ethan": "jack.ethann.wiz@gmail.com",
    "jordan.kelly": "jordan.kelly00.wiz@gmail.com",
    "karen.jackson": "karenjacksonwiz@gmail.com",
    "jane.white": "jane.white.wizz@gmail.com"
  };
  
  if (custom[norm]) return custom[norm];
  
  const match = emailList.find(email => {
    const prefix = email.split("@")[0].toLowerCase();
    return prefix === norm || prefix === norm + ".wiz";
  });
  
  if (match) return match;
  return `${norm}.wiz@gmail.com`;
}

/**
 * Fetch all users from Firestore
 */
function firebaseGetUsers() {
  try {
    const projectId = "ggowcpredictor";
    const apiKey = firebaseConfig.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?pageSize=300&key=${apiKey}`;
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(resp.getContentText());
    
    return parseFirebaseDocuments(data.documents || []);
  } catch (error) {
    Logger.log("Error fetching users: " + error.toString());
    return [];
  }
}

/**
 * Sends launch emails using GmailApp
 * @param {string} mode - "test" or "send-all"
 */
function sendLaunchEmails(mode) {
  Logger.log("Fetching users from Firestore...");
  const users = firebaseGetUsers();
  Logger.log("Loaded " + users.length + " users.");

  let targetUsers = [];
  if (mode === "test") {
    // Test to abdelrazieg (redirected from jane) and jimmy (to his real email)
    const janeUser = users.find(u => u.id === "jane");
    const jimmyUser = users.find(u => u.id === "jimmy");
    
    if (janeUser) {
      targetUsers.push({
        name: janeUser.displayName || "Jane",
        username: "jane",
        password: janeUser.secretCode || "GGO2026",
        email: "abdelrazieg@gmail.com"
      });
    } else {
      Logger.log("Warning: Jane user not found in Firestore. Using fallback values for abdelrazieg test.");
      targetUsers.push({
        name: "Jane",
        username: "jane",
        password: "FallbackPassword123",
        email: "abdelrazieg@gmail.com"
      });
    }

    if (jimmyUser) {
      targetUsers.push({
        name: jimmyUser.displayName || "Jimmy",
        username: "jimmy",
        password: jimmyUser.secretCode || "GGO2026",
        email: getEmailForUsername("jimmy")
      });
    } else {
      Logger.log("Warning: Jimmy user not found in Firestore. Using fallback values for jimmy test.");
      targetUsers.push({
        name: "Jimmy",
        username: "jimmy",
        password: "FallbackPassword123",
        email: "jimmy.pearson.wiz@gmail.com"
      });
    }
    
    Logger.log("Test mode: sending to " + targetUsers.length + " recipients.");
  } else if (mode === "send-all") {
    targetUsers = users.map(u => ({
      name: u.displayName || u.id,
      username: u.id,
      password: u.secretCode || "",
      email: getEmailForUsername(u.id)
    }));
    Logger.log("Send all mode: sending to " + targetUsers.length + " recipients.");
  } else {
    Logger.log("Invalid mode specified. Action aborted.");
    return "Invalid mode";
  }

  // Load HTML template
  const template = HtmlService.createHtmlOutputFromFile("launch-email").getContent();
  let sentCount = 0;
  let failCount = 0;

  targetUsers.forEach(user => {
    try {
      // Replace placeholders
      let body = template;
      body = body.replace(/\{\{name\}\}/g, user.name);
      body = body.replace(/\{\{username\}\}/g, user.username);
      body = body.replace(/\{\{password\}\}/g, user.password);
      body = body.replace(/\{\{email\}\}/g, user.email);

      MailApp.sendEmail({
        to: user.email,
        subject: "GGO World Cup 2026 Predictor — Your Login Details",
        htmlBody: body
      });
      
      Logger.log("  ✓ Email sent to: " + user.email + " (" + user.username + ")");
      sentCount++;
    } catch (err) {
      Logger.log("  ✗ Failed to send to: " + user.email + " Error: " + err.toString());
      failCount++;
    }
  });

  const summary = "Finished. Sent: " + sentCount + ", Failed: " + failCount;
  Logger.log(summary);
  return summary;
}

/**
 * Run test function from script editor
 */
function runEmailTest() {
  return sendLaunchEmails("test");
}

/**
 * Run production send-all function from script editor
 */
function runEmailSendAll() {
  return sendLaunchEmails("send-all");
}
