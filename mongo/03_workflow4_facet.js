db = db.getSiblingDB("GigTask");

// Workflow 4: Multi-Faceted Review Analytics
// Uses $match on indexed fields before $facet to avoid collection scan
// Extracts: rating distributions, skill tag frequency, and overall average rating
db.GigReviews.aggregate([
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
]);