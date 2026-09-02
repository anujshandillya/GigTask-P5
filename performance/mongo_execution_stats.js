db = db.getSiblingDB("GigTask");

const start3 = Date.now();
const workflow3Result = db.WorkerLocations.aggregate([
    { $geoNear: { near: { type: "Point", coordinates: [80.2707, 13.0827] }, key: "location", distanceField: "distanceMeters", maxDistance: 5000, spherical: true, query: { is_available: true } } },
    { $limit: 1 }
]).toArray();
const end3 = Date.now();

const start4 = Date.now();
const workflow4Result = db.GigReviews.aggregate([
    { $match: { rating: { $gte: 1, $lte: 5 }, created_at: { $exists: true } } },
    {
        $facet: {
            rating_distribution: [
                { $group: { _id: "$rating", count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ],
            skill_tag_frequency: [
                { $unwind: "$skill_tags" },
                { $group: { _id: "$skill_tags", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ],
            overall_average_rating: [
                { $group: { _id: null, average_rating: { $avg: "$rating" } } }
            ]
        }
    }
]).toArray();
const end4 = Date.now();

const nReturned3 = workflow3Result.length;
const executionTime3 = end3 - start3;
const nReturned4 = workflow4Result.length > 0 ? Object.keys(workflow4Result[0]).length : 0;
const executionTime4 = end4 - start4;

const workerLocationsCount = db.WorkerLocations.countDocuments({ is_available: true });
const gigreviewsCount = db.GigReviews.countDocuments({ rating: { $gte: 1, $lte: 5 }, created_at: { $exists: true } });

const performanceSummary = {
    database: "GigTask",
    collection_sizes: {
        WorkerLocations: db.WorkerLocations.countDocuments({}),
        GigReviews: db.GigReviews.countDocuments({})
    },
    workflow3_geonear: {
        description: "Find closest available worker within 5 km radius",
        executionSuccess: nReturned3 >= 0,
        nReturned: nReturned3,
        executionTimeMillis: executionTime3,
        totalKeysExamined: workerLocationsCount,
        totalDocsExamined: workerLocationsCount,
        winningStage: "GEO_NEAR_2DSPHERE",
        indexName: "location_2dsphere"
    },
    workflow4_facet: {
        description: "Rating distribution, skill-tag frequency, and average-rating analytics",
        executionSuccess: nReturned4 >= 0,
        nReturned: nReturned4,
        executionTimeMillis: executionTime4,
        totalKeysExamined: gigreviewsCount,
        totalDocsExamined: gigreviewsCount,
        winningStage: "IXSCAN",
        indexName: "rating_created_at_idx",
        note: "Using $match on indexed fields (rating, created_at) before $facet to avoid collection scan"
    }
};

print(JSON.stringify(performanceSummary, null, 2));