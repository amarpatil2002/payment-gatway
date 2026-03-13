const mongoose = require('mongoose');
const ObjectId = mongoose.Schema.Types.ObjectId;

const creditAccountSchema = new mongoose.Schema({

    userId: {
        type: ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true
    },

    balance: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },

    used: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },

    totalCredited: {
        type: Number,
        default: 0
    },

    totalDebited: {
        type: Number,
        default: 0
    }


}, { timestamps: true });

const creditAccountModel = mongoose.model('CreditAccount', creditAccountSchema);

module.exports = creditAccountModel