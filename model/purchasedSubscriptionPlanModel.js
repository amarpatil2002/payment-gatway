const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

const subscriptionSchema = new mongoose.Schema({

    userId: {
        type: ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    planId: {
        type: ObjectId,
        ref: "Plan",
        required: true,
        index: true
    },

    status: {
        type: String,
        enum: ["active", "expired", "cancelled", "revoked"],
        default: "active",
        index: true
    },

    startsAt: {
        type: Date,
        default: Date.now,
        required: true
    },

    expiresAt: {
        type: Date,
        default: null,
        index: true
    },

    paymentId: {
        type: String,
        default: null
    },

    cancelledAt: {
        type: Date,
        default: null
    },

    revokedAt: {
        type: Date,
        default: null
    },

    revokedBy: {
        type: ObjectId,
        ref: "User",
        default: null
    },

    revokeReason: {
        type: String,
        trim: true
    }

}, {
    timestamps: true
});


subscriptionSchema.index(
    { paymentId: 1 },
    {
        unique: true,
        partialFilterExpression: { paymentId: { $exists: true, $ne: null } }
    }
);

const purchasedSubscriptionModel = mongoose.model('Subscription', subscriptionSchema);

module.exports = purchasedSubscriptionModel