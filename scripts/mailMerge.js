// Mail Merge Script for GGO World Cup 2026 Predictor
// Reads user-passwords.csv and launch-email.html, replaces placeholders,
// and outputs individual merged HTML emails to the 'merged-emails' directory.
// Run with: node scripts/mailMerge.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const csvPath = path.join(__dirname, "..", "user-passwords.csv");
const templatePath = path.join(__dirname, "..", "launch-email.html");
const outputDir = path.join(__dirname, "..", "merged-emails");

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`Error: Email template not found at ${templatePath}`);
    process.exit(1);
  }

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
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

  console.log(`Starting mail merge for ${lines.length - 1} users...`);

  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by comma
    const parts = line.split(",");
    if (parts.length < 4) {
      console.warn(`Skipping malformed line ${i + 1}: ${line}`);
      continue;
    }

    const name = parts[nameIdx];
    const username = parts[usernameIdx];
    const email = parts[emailIdx];
    const password = parts[passwordIdx];

    // Replace placeholders
    let mergedHtml = template;
    mergedHtml = mergedHtml.replace(/\{\{name\}\}/g, name);
    mergedHtml = mergedHtml.replace(/\{\{username\}\}/g, username);
    mergedHtml = mergedHtml.replace(/\{\{password\}\}/g, password);
    mergedHtml = mergedHtml.replace(/\{\{email\}\}/g, email);

    const outPath = path.join(outputDir, `${username}.html`);
    fs.writeFileSync(outPath, mergedHtml, "utf8");
    count++;
  }

  console.log(`\nSuccess: Generated ${count} merged email files in: ${outputDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
