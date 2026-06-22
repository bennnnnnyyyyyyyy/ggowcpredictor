import json
from scratch_scrape_squads import fetch_squad_data

def inspect_team_squad(team_id, page_url, search_name):
    squad = fetch_squad_data(team_id, page_url)
    remote_players = []
    if squad:
        for section in squad:
            if isinstance(section, dict) and "members" in section:
                remote_players.extend(section["members"])
                
    print(f"\n--- Remote players in team {team_id} containing '{search_name}' ---")
    found = False
    for p in remote_players:
        if search_name.lower() in p["name"].lower():
            print(f"Name: {p['name']}, ID: {p['id']}, DOB: {p.get('dateOfBirth')}, ShirtNo: {p.get('shirtNumber')}")
            found = True
    if not found:
        print("No match found in remote squad. Printing all remote players names:")
        for p in remote_players:
            print(f"Name: {p['name']}, ID: {p['id']}, DOB: {p.get('dateOfBirth')}, ShirtNo: {p.get('shirtNumber')}")

inspect_team_squad(6715, "/teams/6715/overview/japan", "Endo")      # Japan
inspect_team_squad(6262, "/teams/6262/overview/morocco", "Aguerd")    # Morocco
inspect_team_squad(8491, "/teams/8491/overview/england", "Livramento") # England
