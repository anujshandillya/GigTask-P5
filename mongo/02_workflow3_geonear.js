db = db.getSiblingDB("GigTask");

// Workflow 3: Nearest Available Worker ($geoNear)
// Finds the closest available freelancer within 5 km radius using geospatial index

db.WorkerLocations.aggregate([
    {
        $geoNear: {
            near: {
                type: "Point",
                coordinates: [80.2707, 13.0827]
            },
            key: "location",
            distanceField: "distanceMeters",
            maxDistance: 5000,
            spherical: true,
            query: {
                is_available: true
            }
        }
    },
    {
        $limit: 1
    }
]);