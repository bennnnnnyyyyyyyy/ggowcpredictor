import urllib.request

urls = [
    # Mouhib Chamakh
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHPo79P8m-Q7717RYa6iRzeUE1TEAR6Q_xssUaPbPlwJ8TEX19m1G5m9yoo1mhn7Wew7bvU5JCXF2LgTeNPf0NV24OwlD22-rvdI_keZ2g003SweXD_Z7kZaqjmr-CydTxKM6liilxIhP2OFIJ_E2vjsrwnYgcgpWX-BaSGcQoSDzpYt0fEr7P9xsHQZAGreyK4_3QpBVin9TdOo8wOHdk=",
    # Khalil Ayari
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGoQpiZatmRNpYaD69fR-GLOg95bD4GYBr1emsb8eevfaN7gO-odaI-K-eH1zJvCOHHvSNoDZDMp13BBePjAZFiyvQ2g-3cS78c3wNKASgatGUbUwz1TEALbIo-vGXN5SXhg0C4QALtPPs=",
    # Raed Chikhaoui
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHxABtxfUF9CARNo19YBCna_sra5a2D-vzlTKjJCKOG181xgfRU0-NKO8NBCY5mHMcHN9fEglO35LZmY_L5vcikGE3UR2DRhy6kFHnCwUwCGBXmJgd5JpTwwtMPfDNJrw==",
    # Anas Badawi
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFb8HRnXNzNU8TZ8B4AAAeSPzGX7Y8tQcmJlalh6vgz02afuia77omjcZHUzl-c3wpIT82XCvwkctKjd4bXpFMVQkjZOj6iqj6GO40GhbdL0hL_YSdAibRbZUK3uykDdi_o3U_ruO0zEC5gYg=="
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
