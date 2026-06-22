import urllib.request
import re
import json

url = "https://www.fotmob.com/teams/6710/squad/mexico"
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
            props = js.get("props", {})
            pageProps = props.get("pageProps", {})
            print("pageProps keys:", list(pageProps.keys()))
            
            # Let's write pageProps to a file to examine the squad structure
            with open("scratch_squad_next_data.json", "w", encoding="utf-8") as f:
                json.dump(pageProps, f, indent=2, ensure_ascii=False)
            print("Successfully saved squad NextData")
            
            # Look at squad details if present
            squad = pageProps.get("squad", [])
            print("squad type:", type(squad))
            if isinstance(squad, list) and squad:
                print("squad length:", len(squad))
                print("squad item 0 keys:", squad[0] if isinstance(squad[0], dict) else type(squad[0]))
                # Check for players
                for idx, sec in enumerate(squad):
                    print(f"Section {idx}: {sec.get('title', 'No Title')}")
                    members = sec.get("members", [])
                    print(f"  Members count: {len(members)}")
                    if members:
                        print("  Sample member:", members[0])
        else:
            print("No __NEXT_DATA__ found")
except Exception as e:
    print("Error:", e)
