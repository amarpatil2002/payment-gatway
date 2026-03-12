const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

const paymentSchema = new mongoose.Schema({

    userId: {
        type: ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    planId: {
        type: ObjectId,
        ref: 'Plan',
        required: true
    },

    amount: {
        type: Number,
        required: true
    },

    currency: {
        type: String,
        default: 'INR'
    },

    status: {
        type: String,
        enum: ['pending', 'success', 'failed'],
        default: 'pending',
        index: true
    },

    provider: {
        type: String,
        default: "cashfree"
    },

    providerPaymentId: String,

    metadata: mongoose.Schema.Types.Mixed

}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);