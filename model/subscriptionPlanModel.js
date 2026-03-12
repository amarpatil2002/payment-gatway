const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    price: {
        type: Number,
        required: true,
        min: 0
    },

    credits: {
        type: Number,
        required: true,
        min: 0
    },

    validityDays: {
        type: Number,
        default: null,
        min: 1
    },

    description: {
        type: String,
        trim: true
    },

    isActive: {
        type: Boolean,
        default: true,
        index: true
    }

}, { timestamps: true });

const planModel = mongoose.model('Plan', planSchema);
module.exports = planModel