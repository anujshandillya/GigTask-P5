db = db.getSiblingDB("GigTask");

// Required indexes
db.WorkerLocations.createIndex(
    { location: "2dsphere" },
    { name: "location_2dsphere" }
);

db.WorkerLocations.createIndex(
    { created_at: 1 },
    { name: "created_at_1", expireAfterSeconds: 7200 }
);

// Physical job site coordinates
const jobSite = {
    type: "Point",
    coordinates: [80.2707, 13.0827]
};

// Workflow 3: Nearest Available Freelancer
const nearestFreelancer = db.WorkerLocations.aggregate([
    {
        $geoNear: {
            near: jobSite,
            key: "location",
            distanceField: "distanceMeters",
            maxDistance: 5000,
            spherical: true,
            query: { is_available: true }
        }
    },
    { $limit: 1 }
]).toArray();

// Explain Workflow 3
const workflow3Explain = db.WorkerLocations
    .explain("executionStats")
    .aggregate([
        {
            $geoNear: {
                near: jobSite,
                key: "location",
                distanceField: "distanceMeters",
                maxDistance: 5000,
                spherical: true,
                query: { is_available: true }
            }
        },
        { $limit: 1 }
    ]);

// Extract execution statistics
const geoStats = workflow3Explain.stages[0].$geoNearCursor.executionStats;
const geoPlan = workflow3Explain.stages[0].$geoNearCursor.queryPlanner.winningPlan;
const geoInputPlan = geoPlan.inputStage || geoPlan;

// Final output
const output = {
    database: "GigTask",
    collection_sizes: {
        WorkerLocations: db.WorkerLocations.countDocuments({}),
        GigReviews: db.GigReviews.countDocuments({})
    },
    workflow3_geonear: {
        description: "Find closest available freelancer within 5 km radius",
        job_site: jobSite,
        nearest_freelancer: nearestFreelancer.length > 0 ? nearestFreelancer[0] : null,
        executionSuccess: geoStats.executionSuccess,
        nReturned: Number(workflow3Explain.stages[1].nReturned),
        executionTimeMillis: geoStats.executionTimeMillis,
        totalKeysExamined: geoStats.totalKeysExamined,
        totalDocsExamined: geoStats.totalDocsExamined,
        winningStage: geoInputPlan.stage,
        indexName: geoInputPlan.indexName || null
    }
};

print(JSON.stringify(output, null, 2));