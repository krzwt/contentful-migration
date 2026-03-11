import json
with open(r'd:\Clients\Bluetext\beyond-trust\contentful-migration\data\contentful-schema.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for k in data.keys():
    if "Announcement" in data[k].get("name", ""):
        print(f"ID: {k}, Name: {data[k].get('name')}")
        print(json.dumps(data[k], indent=2))
