import json
import re
import urllib.request
import urllib.parse
import time
import os
import sys

# Ensure UTF-8 printing or fallback
def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8'))

SQUADS_FILE = r"C:\Users\ben.arthur\Desktop\ggowcpredictor\2026\worldcup.squads.json"
NEXT_DATA_FILE = "scratch_next_data.json"

def normalize_name(name):
    clean = name.lower()
    clean = re.sub(r'[^a-z0-9]', '', clean)
    if clean == "czechrepublic" or clean == "czechia":
        return "czechia"
    if clean == "turkey" or clean == "turkiye":
        return "turkiye"
    if clean == "unitedstates" or clean == "usa":
        return "usa"
    if clean == "curacao" or clean == "curaao":
        return "curacao"
    return clean

def get_fotmob_teams():
    with open(NEXT_DATA_FILE, "r", encoding="utf-8") as f:
        next_data = json.load(f)

    teams = {}
    def find_teams_recursive(obj):
        if isinstance(obj, dict):
            if "id" in obj and "name" in obj and isinstance(obj["id"], int) and isinstance(obj["name"], str):
                pageUrl = obj.get("pageUrl", "")
                if "/teams/" in pageUrl or "ccode" in obj or "fifaCode" in obj:
                    teams[obj["id"]] = {
                        "id": obj["id"],
                        "name": obj["name"],
                        "pageUrl": pageUrl
                    }
            for k, v in obj.items():
                find_teams_recursive(v)
        elif isinstance(obj, list):
            for item in obj:
                find_teams_recursive(item)

    find_teams_recursive(next_data)
    return teams

def fetch_squad_data(team_id, page_url):
    squad_path = page_url.replace("/overview/", "/squad/")
    url = f"https://www.fotmob.com{squad_path}"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            next_data = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
            if next_data:
                js = json.loads(next_data.group(1))
                fallback = js.get("props", {}).get("pageProps", {}).get("fallback", {})
                team_key = f"team-{team_id}"
                if team_key in fallback:
                    team_val = fallback[team_key]
                    squad_obj = team_val.get("squad", {})
                    if isinstance(squad_obj, dict):
                        return squad_obj.get("squad", [])
                    return squad_obj
    except Exception as e:
        safe_print(f"Error fetching squad for team {team_id} ({url}): {e}")
    return None

def clean_player_name(name):
    import unicodedata
    nfkd_form = unicodedata.normalize('NFKD', name)
    only_ascii = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    return re.sub(r'[^a-z0-9]', '', only_ascii.lower())

def match_player(local_player, remote_players):
    local_dob = local_player.get("date_of_birth")
    local_num = local_player.get("number")
    local_name_clean = clean_player_name(local_player.get("name", ""))

    # 1. Try Date of Birth + Shirt Number
    for p in remote_players:
        if p.get("dateOfBirth") == local_dob and p.get("shirtNumber") == local_num:
            return p

    # 2. Try Date of Birth only (very strong match)
    dob_matches = [p for p in remote_players if p.get("dateOfBirth") == local_dob]
    if len(dob_matches) == 1:
        return dob_matches[0]

    # 3. Try Shirt Number + Name match
    for p in remote_players:
        if p.get("shirtNumber") == local_num:
            remote_name_clean = clean_player_name(p.get("name", ""))
            if local_name_clean in remote_name_clean or remote_name_clean in local_name_clean:
                return p

    # 4. Try Name match only
    for p in remote_players:
        remote_name_clean = clean_player_name(p.get("name", ""))
        if local_name_clean == remote_name_clean:
            return p

    # 5. Try name containing
    for p in remote_players:
        remote_name_clean = clean_player_name(p.get("name", ""))
        if local_name_clean in remote_name_clean or remote_name_clean in local_name_clean:
            return p

    return None

def main():
    if not os.path.exists(SQUADS_FILE):
        safe_print(f"Squads file not found at {SQUADS_FILE}")
        return

    with open(SQUADS_FILE, "r", encoding="utf-8") as f:
        squads = json.load(f)

    fotmob_teams = get_fotmob_teams()
    
    # Map teams
    team_mappings = {}
    for team in squads:
        team_name = team["name"]
        norm_local = normalize_name(team_name)
        for tid, tinfo in fotmob_teams.items():
            norm_remote = normalize_name(tinfo["name"])
            if norm_local == norm_remote:
                team_mappings[team_name] = tinfo
                break

    safe_print(f"Loaded {len(squads)} teams from squads file. Mapped all {len(team_mappings)} to FotMob IDs.")

    total_players = 0
    matched_players = 0

    for idx, team in enumerate(squads):
        team_name = team["name"]
        tinfo = team_mappings.get(team_name)
        if not tinfo:
            safe_print(f"Warning: no FotMob mapping for team {team_name}")
            continue

        safe_print(f"[{idx+1}/48] Fetching squad for {team_name} (ID: {tinfo['id']})...")
        squad_sections = fetch_squad_data(tinfo["id"], tinfo["pageUrl"])
        
        # Flatten all remote players
        remote_players = []
        if squad_sections:
            for section in squad_sections:
                if isinstance(section, dict) and "members" in section:
                    remote_players.extend(section["members"])

        # Match local players to remote players to get their FotMob IDs
        for player in team.get("players", []):
            total_players += 1
            matched = match_player(player, remote_players)
            if matched:
                player_id = matched["id"]
                player["img"] = f"https://images.weserv.nl/?url=images.fotmob.com/image_resources/playerimages/{player_id}.png"
                matched_players += 1
            else:
                player["img"] = ""
                # Use safe_print to avoid encoding crash
                safe_print(f"  Unmatched player: {player['name']} (No. {player.get('number')}, DOB: {player.get('date_of_birth')})")

        # Sleep a bit to avoid hitting rate limits
        time.sleep(0.5)

    # Save results
    with open(SQUADS_FILE, "w", encoding="utf-8") as f:
        json.dump(squads, f, indent=4, ensure_ascii=False)

    safe_print(f"\nFinished! Matched {matched_players}/{total_players} players successfully and saved updated data to {SQUADS_FILE}")

if __name__ == "__main__":
    main()
