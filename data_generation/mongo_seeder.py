from datetime import datetime, timezone
import random
from faker import Faker
from pymongo import MongoClient
import os
from dotenv import load_dotenv
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DATABASE_NAME = "GigTask"
TOTAL_RECORDS = 510000
BATCH_SIZE = 5000

fake = Faker()
client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
collection = db["WorkerLocations"]

collection.delete_many({})
batch = []

for i in range(1, TOTAL_RECORDS + 1):
    latitude = random.uniform(12.90, 13.20)
    longitude = random.uniform(80.10, 80.40)

    document = {
        "worker_id": fake.random_int(min=1, max=100000),
        "location": {
            "type": "Point",
            "coordinates": [longitude, latitude]
        },
        "created_at": datetime.now(timezone.utc),
        "is_available": fake.boolean()
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