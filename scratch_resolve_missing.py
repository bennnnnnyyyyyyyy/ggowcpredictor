import urllib.request
import urllib.parse
import re
import time
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8'))

missing_players = [
    ("Nidal Čelik", "Bosnia"),
    ("Leverton Pierre", "Haiti"),
    ("Nayef Aguerd", "Morocco"),
    ("Abde Ezzalzouli", "Morocco"),
    ("Wataru Endo", "Japan"),
    ("Mouhib Chamakh", "Tunisia"),
    ("Khalil Ayari", "Tunisia"),
    ("Raed Chikhaoui", "Tunisia"),
    ("Matthew Garbett", "New Zealand"),
    ("Anas Badawi", "Jordan"),
    ("Jaloliddin Masharipov", "Uzbekistan"),
    ("Tino Livramento", "England")
]

def search_ddg_player_id(name):
    query = f"site:fotmob.com/players/ {name}"
    encoded = urllib.parse.quote(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded}"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            # Look for /players/(\d+)/
            # E.g. /players/1036324/valentino-livramento or similar
            matches = re.findall(r'/players/(\d+)/([^&\'"\s>]+)', html)
            if not matches:
                # Try without trailing slash
                matches = re.findall(r'/players/([^&\'"\s>]+)/(\d+)', html)
                if matches:
                    return matches[0][1], matches[0][0]
            if matches:
                return matches[0][0], matches[0][1]
    except Exception as e:
        safe_print(f"Error searching for {name}: {e}")
    return None, None

for name, country in missing_players:
    pid, slug = search_ddg_player_id(name)
    safe_print(f"Player: {name} ({country}) -> ID: {pid}, Slug: {slug}")
    time.sleep(1.0)
