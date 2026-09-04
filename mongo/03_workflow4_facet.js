db = db.getSiblingDB("GigTask");

// Required index for Workflow 4
db.GigReviews.createIndex(
    { rating: 1, created_at: -1 },
    { name: "rating_created_at_idx" }
);

// Workflow 4: Multi-Faceted Review Analytics
const workflow4Pipeline = [
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
];

// Execute Workflow 4
const workflow4Result = db.GigReviews.aggregate(workflow4Pipeline).toArray();

// Explain Workflow 4
const workflow4Explain = db.GigReviews
    .explain("executionStats")
    .aggregate(workflow4Pipeline);

// Find actual IXSCAN stage
function findIndexStage(plan) {
    if (!plan) {
        return null;
    }

    if (plan.stage === "IXSCAN") {
        return plan;
    }

    if (plan.inputStage) {
        const result = findIndexStage(plan.inputStage);

        if (result) {
            return result;
        }
    }

    if (plan.inputStages) {
        for (const stage of plan.inputStages) {
            const result = findIndexStage(stage);

            if (result) {
                return result;
            }
        }
    }

    return null;
}

// Extract execution statistics
const facetStats = workflow4Explain.stages[0].$cursor.executionStats;
const facetPlan = workflow4Explain.stages[0].$cursor.queryPlanner.winningPlan;
const facetIndexStage = findIndexStage(facetPlan);

// Final output
const output = {
    database: "GigTask",
    collection_sizes: {
        WorkerLocations: db.WorkerLocations.countDocuments({}),
        GigReviews: db.GigReviews.countDocuments({})
    },
    workflow4_facet: {
        description: "Rating distribution, top skill-tag frequency, and overall worker rating",
        rating_distribution: workflow4Result.length > 0 ? workflow4Result[0].rating_distribution : [],
        skill_tag_frequency: workflow4Result.length > 0 ? workflow4Result[0].skill_tag_frequency : [],
        overall_average_rating: workflow4Result.length > 0 ? workflow4Result[0].overall_average_rating : [],
        executionSuccess: facetStats.executionSuccess,
        nReturned: workflow4Result.length,
        executionTimeMillis: facetStats.executionTimeMillis,
        totalKeysExamined: facetStats.totalKeysExamined,
        totalDocsExamined: facetStats.totalDocsExamined,
        winningStage: facetIndexStage ? facetIndexStage.stage : facetPlan.stage,
        indexName: facetIndexStage ? facetIndexStage.indexName : null
    }
};

print(JSON.stringify(output, null, 2));