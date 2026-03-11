import json

with open(r'd:\Clients\Bluetext\beyond-trust\contentful-migration\data\contentful-schema.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

if 'bannerImmersive' in data:
    print(json.dumps(data['bannerImmersive'], indent=2))
else:
    print("bannerImmersive not found")
