// Mass Mailing Script for GGO World Cup 2026 Predictor
// Reads user-passwords.csv and launch-email.html, replaces placeholders,
// and optionally sends emails via SMTP using nodemailer.
//
// Usage:
//   1. Local generation (dry-run):
//      node scripts/massMail.js
//   2. Send test emails to jimmy, jane, and selene:
//      node scripts/massMail.js --test
//   3. Send all emails:
//      node scripts/massMail.js --send-all

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple .env parser to avoid extra dependency
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.substring(0, index).trim();
      let val = trimmed.substring(index + 1).trim();
      // Remove enclosing quotes if any
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key] = val;
    }
  }
}

loadEnv();

const csvPath = path.join(__dirname, "..", "user-passwords.csv");
const templatePath = path.join(__dirname, "..", "launch-email.html");
const outputDir = path.join(__dirname, "..", "merged-emails");

// Test usernames to restrict to in --test mode
const TEST_USERNAMES = ["jane", "jimmy", "selene"];

function promptPassword(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (value) => {
      rl.close();
      resolve(value.trim());
    });
  });
}

async function main() {
  const mode = process.argv[2] || "--dry-run";

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`Error: Email template not found at ${templatePath}`);
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const csvContent = fs.readFileSync(csvPath, "utf8");
  const lines = csvContent.trim().split("\n");

  if (lines.length <= 1) {
    console.log("CSV file is empty (only header or nothing).");
    return;
  }

  const header = lines[0].split(",");
  const nameIdx = header.indexOf("name");
  const usernameIdx = header.indexOf("username");
  const emailIdx = header.indexOf("email");
  const passwordIdx = header.indexOf("password");

  if (nameIdx === -1 || usernameIdx === -1 || emailIdx === -1 || passwordIdx === -1) {
    console.error("CSV must contain columns: name, username, email, password");
    process.exit(1);
  }

  // Parse users
  const allUsers = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 4) continue;
    allUsers.push({
      name: parts[nameIdx],
      username: parts[usernameIdx],
      email: parts[emailIdx],
      password: parts[passwordIdx],
    });
  }

  // Determine recipients based on mode
  let targetUsers = [];
  let isSending = false;
  const overrideEmail = process.argv[3];

  if (mode === "--test") {
    targetUsers = allUsers.filter(u => TEST_USERNAMES.includes(u.username.toLowerCase()));
    if (overrideEmail) {
      targetUsers = targetUsers.map(u => ({ ...u, email: overrideEmail }));
    }
    isSending = true;
    console.log(`\n--- TEST MODE ---`);
    if (overrideEmail) {
      console.log(`Test emails will be redirected and sent to: ${overrideEmail}`);
    } else {
      console.log(`Emails will be sent ONLY to test users: ${TEST_USERNAMES.join(", ")}`);
    }
  } else if (mode === "--send-all") {
    targetUsers = allUsers;
    isSending = true;
    console.log(`\n--- PRODUCTION SEND ALL MODE ---`);
    console.log(`Emails will be sent to ALL ${allUsers.length} users!`);
  } else {
    targetUsers = allUsers;
    isSending = false;
    console.log(`\n--- DRY-RUN MODE (default) ---`);
    console.log(`Generating merged files locally. No emails will be sent.`);
  }

  // If sending, configure SMTP Transporter
  let transporter = null;
  if (isSending) {
    const host = process.env.SMTP_HOST || "mail.gulfglobaloutsourcing.com";
    const port = process.env.SMTP_PORT || 465;
    const secure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === "true" : true;
    const user = process.env.SMTP_USER || "abdelrazieg.mohamed@gulfglobaloutsourcing.com";
    let pass = process.env.SMTP_PASS;

    if (!pass) {
      pass = await promptPassword(`Enter SMTP password for ${user}: `);
    }

    const from = process.env.SMTP_FROM || user;

    transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure,
      auth: { user, pass },
    });

    // Verify SMTP connection
    console.log("Verifying SMTP connection...");
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully!\n");
    } catch (err) {
      console.error("SMTP verification failed:", err.message);
      process.exit(1);
    }
  }

  let count = 0;
  for (const user of targetUsers) {
    // Generate HTML
    let mergedHtml = template;
    mergedHtml = mergedHtml.replace(/\{\{name\}\}/g, user.name);
    mergedHtml = mergedHtml.replace(/\{\{username\}\}/g, user.username);
    mergedHtml = mergedHtml.replace(/\{\{password\}\}/g, user.password);
    mergedHtml = mergedHtml.replace(/\{\{email\}\}/g, user.email);

    // Save locally
    const outPath = path.join(outputDir, `${user.username}.html`);
    fs.writeFileSync(outPath, mergedHtml, "utf8");

    if (isSending) {
      console.log(`Sending to ${user.name} (${user.email})...`);
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: process.env.EMAIL_SUBJECT || "GGO World Cup 2026 Predictor — Your Login Details",
        html: mergedHtml,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`  ✓ Email sent successfully.`);
        count++;
      } catch (err) {
        console.error(`  ✗ Failed to send email to ${user.email}:`, err.message);
      }
    } else {
      console.log(`Generated: ${user.username}.html`);
      count++;
    }
  }

  if (isSending) {
    console.log(`\nFinished: Sent ${count} of ${targetUsers.length} emails.`);
  } else {
    console.log(`\nFinished: Generated ${count} HTML files in: ${outputDir}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
