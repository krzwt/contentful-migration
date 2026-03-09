import json

with open(r'd:\Clients\Bluetext\beyond-trust\contentful-migration\data\contentful-schema.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

if 'bannerImmersive' in data:
    fields = data['bannerImmersive'].get('fields', {})
    for fid, fdef in fields.items():
        print(f"Field ID: {fid}, Type: {fdef.get('type')}, LinkType: {fdef.get('linkType')}")
else:
    print("bannerImmersive not found")
