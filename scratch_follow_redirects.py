import urllib.request

urls = [
    # Nidal Celik
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHLw7RICm5AIJMQ2P8d7P-yGBk16rg0U2hR2mwqUvFsB3pQ9bSz_2v7uPU6pmv5vQlhlGsk7oeGHSLGMisSDz3HcgEY_hS1N94K9e2-edG-XU2CUEWBNVhRng3fcukh12I6amDUBrz0RA==",
    # Leverton Pierre
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHMVF5He92_YX7CweWrp1OOdbsb-9xaoCqc1YQU_bb3joWf0px4iWOgwv6tJmDH7Pk_zaPWco8znm4Vw0J5w_QzUPzNxVQx2KD9EU5N6R4lcxIn78WHP88Y-0I81BMnhd0wywT9cBcwV8Ff5g==",
    # Matthew Garbett
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHLV7kORlLvNRChpMD7KCq_lENc5l5wj7Fu6n6mkVp8vKl62hf24TSjjhEYFnxZCOknr5PCPGZx6rzuHppIYKEVrSRZhujIx0xuUsu_PCEkD1TSlfCUhuPLDyGkHz3f1js8oKKeHcTUiWHrTH0=",
    # Jaloliddin Masharipov
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHbSaNlP7Gb7-KuZ47Z6IJ732M0XFOWH2YMTJ9-FFLZqXPwjIx9OfIrM_bM9sn377o_hJbITNg32L-JZxoFpqdSz9hX1JGb7zgo7Sm497OtpRv-pFCYpUZ7CxFapJbWGRin9ApBH09H2eIOPsdNKjF-Rw=="
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
