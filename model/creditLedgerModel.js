const mongoose = require("mongoose");

const creditLedgerSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    type: {
        type: String,
        enum: ["credit", "debit"],
        required: true
    },

    amount: {
        type: Number,
        required: true
    },

    source: {
        type: String,
        enum: ["subscription", "usage", "admin"],
        required: true
    },

    referenceId: mongoose.Schema.Types.ObjectId,

    balanceAfter: Number

}, { timestamps: true });

creditLedgerSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("CreditLedger", creditLedgerSchema);