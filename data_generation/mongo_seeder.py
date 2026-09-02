from datetime import datetime, timezone
import random
from pymongo import MongoClient

MONGO_URI = "mongodb://localhost:27017/"
DATABASE_NAME = "GigTask"
TOTAL_RECORDS = 510000
BATCH_SIZE = 5000

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
collection = db["WorkerLocations"]

collection.delete_many({})
batch = []

for i in range(1, TOTAL_RECORDS + 1):
    latitude = random.uniform(12.90, 13.20)
    longitude = random.uniform(80.10, 80.40)
    
    document = {
        "worker_id": random.randint(1, 100000),
        "location": {
            "type": "Point",
            "coordinates": [longitude, latitude]
        },
        "created_at": datetime.now(timezone.utc),
        "is_available": random.choice([True, False])
    }
    
    batch.append(document)

    if len(batch) == BATCH_SIZE:
        collection.insert_many(batch)
        print(f"Inserted {i} records")
        batch = []

if batch:
    collection.insert_many(batch)

print("Data generation completed.")
print("Total WorkerLocations:", collection.count_documents({}))
client.close()