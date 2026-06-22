import json
import re

with open("2026/worldcup.squads.json", "r", encoding="utf-8") as f:
    squads_data = json.load(f)

with open("scratch_next_data.json", "r", encoding="utf-8") as f:
    next_data = json.load(f)

# Find all teams recursively from next_data
teams_in_next = {}
def find_teams_recursive(obj):
    if isinstance(obj, dict):
        if "id" in obj and "name" in obj and isinstance(obj["id"], int) and isinstance(obj["name"], str):
            pageUrl = obj.get("pageUrl", "")
            if "/teams/" in pageUrl or "ccode" in obj or "fifaCode" in obj:
                teams_in_next[obj["id"]] = {
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

mappings = {}
for team in squads_data:
    team_name = team["name"]
    norm_local = normalize_name(team_name)
    for tid, tinfo in teams_in_next.items():
        norm_remote = normalize_name(tinfo["name"])
        if norm_local == norm_remote:
            mappings[team_name] = {
                "id": tid,
                "name": tinfo["name"],
                "pageUrl": tinfo["pageUrl"]
            }
            break

for k, v in sorted(mappings.items()):
    print(f"{k} -> {v['name']} ({v['id']}): {v['pageUrl']}")
