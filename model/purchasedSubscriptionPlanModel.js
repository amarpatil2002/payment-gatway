const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

const subscriptionSchema = new mongoose.Schema({

    userId: {
        type: ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    planId: {
        type: ObjectId,
        ref: 'Plan',
        required: true,
        index: true
    },
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        unique: true,
        index: true
    }
    ,
    status: {
        type: String,
        enum: ['active', 'expired', 'cancelled'],
        default: 'active',
        index: true
    },

    startsAt: {
        type: Date,
        default: Date.now,
        required: true
    },

    // Optional for unlimited plans
    expiresAt: {
        type: Date,
        default: null,
        index: true
    }

}, {
    timestamps: true,
});

subscriptionSchema.index({ userId: 1, status: 1 });

const purchasedSubscriptionModel = mongoose.model('Subscription', subscriptionSchema);

module.exports = purchasedSubscriptionModel