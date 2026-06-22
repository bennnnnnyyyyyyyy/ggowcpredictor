import json

with open("scratch_squad_next_data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

fallback = data.get("fallback", {})
team_data = fallback.get("team-6710", {})
squad = team_data.get("squad", [])
print(json.dumps(squad, indent=2))
