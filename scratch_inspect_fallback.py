import json

with open("scratch_squad_next_data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

fallback = data.get("fallback", {})
print("Fallback keys:")
for k in fallback.keys():
    print(k[:100])
