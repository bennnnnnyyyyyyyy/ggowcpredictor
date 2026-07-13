import os
import re
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

# Configuration
TARGET_URL = "https://bellvox.ai"
OUTPUT_FOLDER = "bellvox_site"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def clean_filename(url):
    path = urlparse(url).path
    filename = os.path.basename(path)
    filename = re.sub(r'[^\w\.\-]', '_', filename)
    return filename

def download_file(url, folder, default_name):
    filename = clean_filename(url) or default_name
    filepath = os.path.join(folder, filename)
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        if response.status_code == 200:
            with open(filepath, 'wb') as f:
                f.write(response.content)
            return filename
    except Exception:
        pass
    return None

def main():
    css_dir = os.path.join(OUTPUT_FOLDER, "css")
    js_dir = os.path.join(OUTPUT_FOLDER, "js")
    os.makedirs(css_dir, exist_ok=True)
    os.makedirs(js_dir, exist_ok=True)

    print("Connecting to the website...")
    try:
        response = requests.get(TARGET_URL, headers=HEADERS, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print("Failed to connect.")
        return

    soup = BeautifulSoup(response.text, 'html.parser')

    print("Downloading CSS stylesheets...")
    for link in soup.find_all("link", rel="stylesheet"):
        href = link.get("href")
        if href:
            absolute_url = urljoin(TARGET_URL, href)
            saved_name = download_file(absolute_url, css_dir, "style.css")
            if saved_name:
                link["href"] = f"css/{saved_name}"

    print("Downloading JavaScript chunks...")
    for script in soup.find_all("script"):
        src = script.get("src")
        if src:
            absolute_url = urljoin(TARGET_URL, src)
            saved_name = download_file(absolute_url, js_dir, "script.js")
            if saved_name:
                script["src"] = f"js/{saved_name}"

    html_path = os.path.join(OUTPUT_FOLDER, "index.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(soup.prettify())
        
    print("Process Complete! Please check the 'bellvox_site' folder.")

if __name__ == "__main__":
    main()
