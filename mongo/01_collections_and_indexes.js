db = db.getSiblingDB("GigTask");

db.createCollection("Portfolios")
db.createCollection("GigReviews")
db.createCollection("WorkerLocations")

// Workflow 3: Geospatial indexes for $geoNear
db.WorkerLocations.createIndex(
    { location: "2dsphere" },
    { name: "location_2dsphere" }
)

db.WorkerLocations.createIndex(
    { created_at: 1 },
    { 
        name: "created_at_1",
        expireAfterSeconds: 7200 
    }
)

// Workflow 4: Composite index on rating and created_at for optimized $facet
db.GigReviews.createIndex(
    { rating: 1, created_at: -1 },
    { name: "rating_created_at_idx" }
)

db.Portfolios.insertMany([
    {
        freelancer_id: 1,
        skills: ["Java", "Spring Boot", "MySQL"],
        certifications: ["Oracle Java SE"]
    },
    {
        freelancer_id: 2,
        skills: ["Python", "MongoDB", "AWS"],
        certifications: ["AWS Certified Developer"]
    },
    {
        freelancer_id: 3,
        skills: ["React", "Node.js", "JavaScript"],
        certifications: ["Meta Front-End Developer"]
    }
])

db.GigReviews.insertMany([
    {
        freelancer_id: 1,
        rating: 5,
        skill_tags: ["Java", "Spring Boot"],
        created_at: new Date()
    },
    {
        freelancer_id: 1,
        rating: 4,
        skill_tags: ["Java", "MySQL"],
        created_at: new Date()
    },
    {
        freelancer_id: 2,
        rating: 5,
        skill_tags: ["Python", "MongoDB"],
        created_at: new Date()
    },
    {
        freelancer_id: 2,
        rating: 3,
        skill_tags: ["Python", "AWS"],
        created_at: new Date()
    },
    {
        freelancer_id: 3,
        rating: 4,
        skill_tags: ["React", "JavaScript"],
        created_at: new Date()
    }
])

db.WorkerLocations.insertMany([
    {
        worker_id: 1,
        location: {
            type: "Point",
            coordinates: [80.2707, 13.0827]
        },
        created_at: new Date(),
        is_available: true
    },
    {
        worker_id: 2,
        location: {
            type: "Point",
            coordinates: [80.2800, 13.0900]
        },
        created_at: new Date(),
        is_available: true
    },
    {
        worker_id: 3,
        location: {
            type: "Point",
            coordinates: [80.3000, 13.1000]
        },
        created_at: new Date(),
        is_available: false
    },
    {
        worker_id: 4,
        location: {
            type: "Point",
            coordinates: [80.2500, 13.0700]
        },
        created_at: new Date(),
        is_available: true
    }
])

print("MongoDB collections, indexes and sample data created successfully.")