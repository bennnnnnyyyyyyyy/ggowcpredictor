import fs from "fs";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://nthnysznieivbkncpqrk.supabase.co";
// Replace with your REGENERATED key
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50aG55c3puaWVpdmJrbmNwcXJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI5MDQwMCwiZXhwIjoyMDk2ODY2NDAwfQ.2vlp4S5qI6DO8wgHerMBsIfLDzZKeq69yQT2isLGKPQ";

const TABLES = [
  "users",
  "predictions",
  "fixtures",
  "results",
  "leaderboard",
  "accountRequests",
];

async function backupSupabase() {
  console.log("Starting backup...");

  const workbook = XLSX.utils.book_new();
  const backupDate = new Date().toString();

  for (const table of TABLES) {
    console.log(`Fetching data for: ${table}`);
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;

    try {
      const response = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch ${table}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      const sheetData = [[`Last Backup: ${backupDate}`]];

      if (data && data.length > 0) {
        const headers = Object.keys(data[0]);
        sheetData.push(headers);

        data.forEach((row) => {
          const rowData = headers.map((h) => {
            const value = row[h];
            return typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : value;
          });
          sheetData.push(rowData);
        });
      } else {
        sheetData.push(["No data found in this table."]);
      }

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, table);
    } catch (error) {
      console.error(`Error processing table ${table}:`, error);
    }
  }

  const fileName = `Supabase_Backup_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  console.log(`✅ Backup completed successfully. Saved as ${fileName}`);
}

backupSupabase();
