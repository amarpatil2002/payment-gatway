const purchasedSubscriptionModel = require("../models/purchasedSubscriptionPlanModel");
const creditAccountModel = require("../models/creditAccountModel");
const planModel = require("../models/subscriptionPlanModel");
const creditLedgerModel = require("../models/creditLedgerModel");


exports.activateSubscription = async (payment) => {

    const plan = await planModel.findById(payment.planId).lean();

    if (!plan) return;

    let expiresAt = null;

    if (plan.validityDays) {
        expiresAt = new Date();
        expiresAt.setDate(
            expiresAt.getDate() + plan.validityDays
        );
    }

    /* ---------- EXPIRE OLD SUBSCRIPTION ---------- */

    await purchasedSubscriptionModel.updateMany(
        {
            userId: payment.userId,
            status: "active"
        },
        {
            status: "expired"
        }
    );

    /* ---------- CREATE NEW SUBSCRIPTION ---------- */

    await purchasedSubscriptionModel.create({
        userId: payment.userId,
        planId: payment.planId,
        status: "active",
        startsAt: new Date(),
        expiresAt
    });

    /* ---------- ADD CREDITS ---------- */

    if (plan.credits > 0) {

        const account = await creditAccountModel.findOneAndUpdate(
            { userId: payment.userId },
            { $inc: { balance: plan.credits } },
            { upsert: true, new: true }
        );

        /* ---------- LEDGER ENTRY ---------- */

        await creditLedgerModel.create({
            userId: payment.userId,
            type: "credit",
            amount: plan.credits,
            source: "subscription",
            referenceId: payment._id,
            balanceAfter: account.balance
        });

    }
};