import json
from collections import Counter

def get_types(obj):
    types = []
    if isinstance(obj, dict):
        if 'type' in obj:
            types.append(obj['type'])
        for v in obj.values():
            types.extend(get_types(v))
    elif isinstance(obj, list):
        for item in obj:
            types.extend(get_types(item))
    return types

with open(r'd:\Clients\Bluetext\beyond-trust\contentful-migration\data\new-blog.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

all_types = get_types(data)
unique_types = Counter(all_types)

print("Unique types found in new-blog.json:")
for t, count in unique_types.items():
    print(f"{t}: {count}")
