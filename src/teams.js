// Team flag helpers for Apps Script
// Uses the Firestore REST API already established in firebase.js/main.js.

const TEAMS_COLLECTION = "teams";

function getTeamFlagsMap() {
  return {
    alg: { name: "Algeria", fifa_code: "ALG", flag_icon: "🇩🇿" },
    arg: { name: "Argentina", fifa_code: "ARG", flag_icon: "🇦🇷" },
    aus: { name: "Australia", fifa_code: "AUS", flag_icon: "🇦🇺" },
    aut: { name: "Austria", fifa_code: "AUT", flag_icon: "🇦🇹" },
    bel: { name: "Belgium", fifa_code: "BEL", flag_icon: "🇧🇪" },
    bih: { name: "Bosnia and Herzegovina", fifa_code: "BIH", flag_icon: "🇧🇦" },
    bra: { name: "Brazil", fifa_code: "BRA", flag_icon: "🇧🇷" },
    can: { name: "Canada", fifa_code: "CAN", flag_icon: "🇨🇦" },
    civ: { name: "Ivory Coast", fifa_code: "CIV", flag_icon: "🇨🇮" },
    cod: { name: "DR Congo", fifa_code: "COD", flag_icon: "🇨🇩" },
    col: { name: "Colombia", fifa_code: "COL", flag_icon: "🇨🇴" },
    cpv: { name: "Cape Verde", fifa_code: "CPV", flag_icon: "🇨🇻" },
    cro: { name: "Croatia", fifa_code: "CRO", flag_icon: "🇭🇷" },
    cuw: { name: "Curacao", fifa_code: "CUW", flag_icon: "🇨🇼" },
    cze: { name: "Czech Republic", fifa_code: "CZE", flag_icon: "🇨🇿" },
    ecu: { name: "Ecuador", fifa_code: "ECU", flag_icon: "🇪🇨" },
    egy: { name: "Egypt", fifa_code: "EGY", flag_icon: "🇪🇬" },
    eng: { name: "England", fifa_code: "ENG", flag_icon: "🏴" },
    esp: { name: "Spain", fifa_code: "ESP", flag_icon: "🇪🇸" },
    fra: { name: "France", fifa_code: "FRA", flag_icon: "🇫🇷" },
    ger: { name: "Germany", fifa_code: "GER", flag_icon: "🇩🇪" },
    gha: { name: "Ghana", fifa_code: "GHA", flag_icon: "🇬🇭" },
    hai: { name: "Haiti", fifa_code: "HAI", flag_icon: "🇭🇹" },
    irn: { name: "Iran", fifa_code: "IRN", flag_icon: "🇮🇷" },
    irq: { name: "Iraq", fifa_code: "IRQ", flag_icon: "🇮🇶" },
    jor: { name: "Jordan", fifa_code: "JOR", flag_icon: "🇯🇴" },
    jpn: { name: "Japan", fifa_code: "JPN", flag_icon: "🇯🇵" },
    kor: { name: "South Korea", fifa_code: "KOR", flag_icon: "🇰🇷" },
    ksa: { name: "Saudi Arabia", fifa_code: "KSA", flag_icon: "🇸🇦" },
    mar: { name: "Morocco", fifa_code: "MAR", flag_icon: "🇲🇦" },
    mex: { name: "Mexico", fifa_code: "MEX", flag_icon: "🇲🇽" },
    ned: { name: "Netherlands", fifa_code: "NED", flag_icon: "🇳🇱" },
    nor: { name: "Norway", fifa_code: "NOR", flag_icon: "🇳🇴" },
    nzl: { name: "New Zealand", fifa_code: "NZL", flag_icon: "🇳🇿" },
    pan: { name: "Panama", fifa_code: "PAN", flag_icon: "🇵🇦" },
    par: { name: "Paraguay", fifa_code: "PAR", flag_icon: "🇵🇾" },
    por: { name: "Portugal", fifa_code: "POR", flag_icon: "🇵🇹" },
    qat: { name: "Qatar", fifa_code: "QAT", flag_icon: "🇶🇦" },
    rsa: { name: "South Africa", fifa_code: "RSA", flag_icon: "🇿🇦" },
    sco: { name: "Scotland", fifa_code: "SCO", flag_icon: "🏴" },
    sen: { name: "Senegal", fifa_code: "SEN", flag_icon: "🇸🇳" },
    sui: { name: "Switzerland", fifa_code: "SUI", flag_icon: "🇨🇭" },
    swe: { name: "Sweden", fifa_code: "SWE", flag_icon: "🇸🇪" },
  };
}

function updateTeamsCollection(teamMap) {
  const projectId = firebaseConfig.projectId;
  const apiKey = firebaseConfig.apiKey;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${TEAMS_COLLECTION}`;
  const results = [];

  Object.entries(teamMap).forEach(([docId, team]) => {
    const payload = convertToFirebaseDocument(team);
    const url = `${base}/${docId}?key=${apiKey}`;
    const response = UrlFetchApp.fetch(url, {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    results.push({
      docId,
      statusCode: response.getResponseCode(),
      ok: response.getResponseCode() >= 200 && response.getResponseCode() < 300,
    });
  });

  return {
    collection: TEAMS_COLLECTION,
    total: results.length,
    updated: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    details: results,
  };
}

function syncTeamFlags() {
  return updateTeamsCollection(getTeamFlagsMap());
}
