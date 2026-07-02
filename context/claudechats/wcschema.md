# Task: Update World Cup JSON with Proxy-Wrapped Player Images

You are tasked with updating the local World Cup prediction game dataset. You need to modify the JSON file to include a proxy-wrapped FotMob image URL for every player in the dataset.

### 1. Target File Path

`C:\Users\ben.arthur\Desktop\ggowcpredictor\2026\worldcup.squads.json`

### 2. Required Image URL Format

To avoid CORS blocks and optimize performance, all images must be routed through the `images.weserv.nl` proxy using this exact string template:
`https://images.weserv.nl/?url=images.fotmob.com/image_resources/playerimages/{fotmob_player_id}.png`

### 3. Execution Instructions

* Parse the target JSON file.
* For each player object within the `"players"` array, append a new key-value pair: `"img": "PROXY_URL"`.
* Ensure you map the correct FotMob player ID to each respective player name.
* Save the updated file back to the original path ensuring valid JSON formatting.

```

# Python Automation Script

This script reads your existing `worldcup.squads.json` file, safely traverses your nested squads structure, injects the new `"img"` field using the proxy format, and writes it back cleanly.

Since your raw JSON doesn't contain FotMob IDs yet, the script includes a `FOTMOB_ID_MAP` dictionary helper where you (or your agent) can map player names to their IDs. If a name isn't mapped, it safely defaults to a placeholder ID or an empty string so your frontend doesn't crash.

**Python**

```

import json
import os

# 1. Define the absolute file path

FILE_PATH = r"C:\Users\ben.arthur\Desktop\ggowcpredictor\2026\worldcup.squads.json"

# 2. Lookup dictionary for player names to FotMob IDs

# Add mappings here. Your agent can populate this dynamically.

FOTMOB_ID_MAP = {
    "Matěj Kovář": "1418549",  # Example ID
    "David Zima": "1133545",
    "Tomáš Holeš": "432521",
    "Robin Hranáč": "1256241"
}

def generate_proxy_url(player_id):
    """Wraps the FotMob image CDN link into the weserv.nl CORS proxy."""
    if not player_id:
        return ""
    return f"https://images.weserv.nl/?url=images.fotmob.com/image_resources/playerimages/{player_id}.png"

def update_squad_images():
    # Check if file exists before running
    if not os.path.exists(FILE_PATH):
        print(f"Error: The file at {FILE_PATH} was not found.")
        return

    # Load the original JSON data
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Process teams and players
    for team in data:
        team_name = team.get("name", "Unknown Team")
        print(f"Processing squad for: {team_name}")

    for player in team.get("players", []):
            player_name = player.get("name")

    # Fetch FotMob ID from the map, default to None if missing
            fotmob_id = FOTMOB_ID_MAP.get(player_name, None)

    # Generate the proxy link and inject the new 'img' property
            player["img"] = generate_proxy_url(fotmob_id)

    # Write the modified structure back to disk with clean formatting
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print(f"\nSuccess! Successfully updated schema and saved to: {FILE_PATH}")

if __name__ == "__main__":
    update_squad_images()

```

### Resulting JSON Structure

After running the script or letting your agent execute it, your file layout will look like this:

**JSON**

```

[
    {
        "name": "Czech Republic",
        "fifa_code": "CZE",
        "group": "A",
        "players": [
            {
                "number": 1,
                "pos": "GK",
                "name": "Matěj Kovář",
                "date_of_birth": "2000-05-17",
                "img": "https://images.weserv.nl/?url=images.fotmob.com/image_resources/playerimages/14qqq18549.png" 
            },
            {
                "number": 2,
                "pos": "DF",
                "name": "David Zima",
                "date_of_birth": "2000-11-08",
                "img": "https://images.weserv.nl/?url=images.fotmob.com/image_resources/playerimages/1133q545.png"
            }
        ]
    }
]

links above are fake
