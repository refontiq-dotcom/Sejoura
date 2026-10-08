import urllib.request
url = "https://refontiq-dotcom.github.io/Sejoura-demo/index.html"
response = urllib.request.urlopen(url)
html = response.read().decode('utf-8')
with open("/home/dukoua/Projets/Séjoura/landing.html", "w") as f:
    f.write(html)
