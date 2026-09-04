from datetime import datetime, timezone
import random
from faker import Faker
from pymongo import MongoClient
import os
from dotenv import load_dotenv
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DATABASE_NAME = "GigTask"
TOTAL_REVIEWS = 110000
BATCH_SIZE = 5000

SKILLS = [
    "Java", "Spring Boot", "Python", "C++",
    "JavaScript", "React", "Node.js", "SQL",
    "MongoDB", "AWS", "Docker", "Kubernetes"
]

fake = Faker()

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
collection = db["GigReviews"]

collection.delete_many({})
batch = []

for i in range(1, TOTAL_REVIEWS + 1):
    number_of_skills = random.randint(1, 4)

    document = {
        "freelancer_id": fake.random_int(min=1, max=100000),
        "rating": fake.random_int(min=1, max=5),
        "skill_tags": random.sample(SKILLS, number_of_skills),
        "created_at": datetime.now(timezone.utc)
    }

    batch.append(document)

    if len(batch) == BATCH_SIZE:
        collection.insert_many(batch)
        print(f"Inserted {i} reviews")
        batch = []

if batch:
    collection.insert_many(batch)

print("GigReviews data generation completed.")
print("Total GigReviews:", collection.count_documents({}))

client.close()