import json

with open(r'd:\Clients\Bluetext\beyond-trust\contentful-migration\data\contentful-schema.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for ct in data.get('contentTypes', []):
    if ct.get('sys', {}).get('id') == 'bannerImmersive':
        print(json.dumps(ct, indent=2))
        break
