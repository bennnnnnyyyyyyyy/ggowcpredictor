import urllib.request

urls = [
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGmPbpqIgK590xjtg_EO45rw9qyg_8GzXnCs1MBKuUhZce96UPz3KPRo_bjxjdxNU_2kV6e32fKUFcHREvIT7NA-fduFnWtRo0YaAvu7_wIUMUo1sb6ogpogRYYQw=="
]

class NoRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        print("Redirect to:", newurl)
        return None

opener = urllib.request.build_opener(NoRedirection)
for url in urls:
    try:
        opener.open(url)
    except Exception as e:
        pass
