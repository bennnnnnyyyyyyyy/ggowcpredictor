import urllib.request
import json
import urllib.parse

def test_url(url):
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            print("SUCCESS:", url)
            print(json.dumps(data, indent=2)[:500])
            return data
    except Exception as e:
        print("FAILED:", url, "-", e)
        return None

test_url("https://www.fotmob.com/api/search/suggest?term=Wataru+Endo")
test_url("https://www.fotmob.com/api/search/suggest?q=Wataru+Endo")
test_url("https://www.fotmob.com/api/search?term=Wataru+Endo")
