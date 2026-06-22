import json

with open("scratch_next_data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

teams = {}

# Let's inspect the 'table' key if present
# Typically, table has groups, each group has table -> allTeams
table = data.get("table", [])
print("table type:", type(table))

# Let's do a recursive search for dicts with key "name" and "id" and see if they look like teams
def find_teams_recursive(obj):
    if isinstance(obj, dict):
        if "id" in obj and "name" in obj and isinstance(obj["id"], int) and isinstance(obj["name"], str):
            # Check if this could be a team
            # Usually team objects in fotmob have a pageUrl or are part of table/standings
            # Let's collect them
            # Check if it has a pageUrl starting with /teams/
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

find_teams_recursive(data)

print(f"Found {len(teams)} unique teams:")
for tid, tinfo in sorted(teams.items(), key=lambda x: x[1]["name"]):
    print(f"  {tinfo['name']} (ID: {tid}): {tinfo['pageUrl']}")
