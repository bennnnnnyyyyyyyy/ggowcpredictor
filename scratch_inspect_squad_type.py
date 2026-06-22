import json

with open("scratch_squad_next_data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

fallback = data.get("fallback", {})
team_data = fallback.get("team-6710", {})
squad = team_data.get("squad", {})
print("Type of squad:", type(squad))
if isinstance(squad, dict):
    print("squad keys:", list(squad.keys()))
elif isinstance(squad, list):
    print("squad length:", len(squad))
    for i, x in enumerate(squad):
        print(f"item {i}: type={type(x)}, value={repr(x)[:200]}")
