import urllib.request
import re
import json

url = "https://www.fotmob.com/leagues/77/overview/world-cup"
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
            # Let's dump keys and drill down
            props = js.get("props", {})
            pageProps = props.get("pageProps", {})
            print("pageProps keys:", list(pageProps.keys()))
            
            # Let's save the JSON for inspection
            with open("scratch_next_data.json", "w", encoding="utf-8") as f:
                json.dump(pageProps, f, indent=2, ensure_ascii=False)
            print("Wrote pageProps to scratch_next_data.json")
        else:
            print("No __NEXT_DATA__ found")
except Exception as e:
    print("Error:", e)
