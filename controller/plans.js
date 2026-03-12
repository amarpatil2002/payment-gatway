const planModel = require("../model/subscriptionPlanModel");

exports.getPlan = async (req, res) => {

    try {

        const { planId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(planId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid planId"
            });
        }

        const plan = await planModel
            .findById(planId)
            .select("name price credits validityDays description isActive createdAt")
            .lean();

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: plan
        });

    } catch (error) {

        console.error("getPlan error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

exports.getAllPlans = async (req, res) => {

    try {
        const {
            page = 1,
            limit = 10,
            isActive,
            sort = "createdAt",
            order = "desc"
        } = req.query;

        const parsedPage = Math.max(parseInt(page) || 1, 1);
        const parsedLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
        const skip = (parsedPage - 1) * parsedLimit;

        const filter = {};

        if (typeof isActive !== "undefined") {
            filter.isActive = isActive === "true";
        }

        const allowedSortFields = [
            "createdAt",
            "price",
            "name",
            "validityDays"
        ];

        const sortField = allowedSortFields.includes(sort)
            ? sort
            : "createdAt";

        const sortOrder = order === "asc" ? 1 : -1;

        const sortOptions = {
            [sortField]: sortOrder
        };

        const [plans, total] = await Promise.all([

            planModel
                .find(filter)
                .sort(sortOptions)
                .skip(skip)
                .limit(parsedLimit)
                .select(
                    "name price credits validityDays description isActive createdAt"
                )
                .lean(),

            planModel.countDocuments(filter)

        ]);

        /* ---------- RESPONSE ---------- */

        return res.status(200).json({
            success: true,
            data: {
                plans,
                pagination: {
                    totalRecords: total,
                    currentPage: parsedPage,
                    limit: parsedLimit,
                    totalPages: Math.ceil(total / parsedLimit)
                }
            }
        });

    } catch (error) {

        console.error("getAllPlans error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};