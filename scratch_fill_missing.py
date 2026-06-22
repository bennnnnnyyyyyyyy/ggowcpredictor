import json
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8'))

SQUADS_FILE = r"C:\Users\ben.arthur\Desktop\ggowcpredictor\2026\worldcup.squads.json"

with open(SQUADS_FILE, "r", encoding="utf-8") as f:
    squads = json.load(f)

# Map of player names to FotMob IDs
manual_map = {
    "Nidal Čelik": "1657810",
    "Leverton Pierre": "899318",
    "Nayef Aguerd": "620716",
    "Abde Ezzalzouli": "1053746",
    "Wataru Endo": "878248",
    "Mouhib Chamakh": "1718458",
    "Khalil Ayari": "1715492",
    "Raed Chikhaoui": "1721242",
    "Matthew Garbett": "1108605",
    "Anas Badawi": "1991034",
    "Jaloliddin Masharipov": "533382",
    "Tino Livramento": "1036324"
}

updated_count = 0
for team in squads:
    for player in team.get("players", []):
        name = player.get("name")
        if name in manual_map:
            player_id = manual_map[name]
            player["img"] = f"https://images.weserv.nl/?url=images.fotmob.com/image_resources/playerimages/{player_id}.png"
            updated_count += 1
            safe_print(f"Updated {name} with ID {player_id}")

with open(SQUADS_FILE, "w", encoding="utf-8") as f:
    json.dump(squads, f, indent=4, ensure_ascii=False)

safe_print(f"Successfully manually updated {updated_count} players.")
