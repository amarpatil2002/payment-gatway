const purchasedSubscriptionModel = require("../model/purchasedSubscriptionPlanModel");
const creditAccountModel = require("../model/creditAccountModel");
const planModel = require("../model/subscriptionPlanModel");
const creditLedgerModel = require("../model/creditLedgerModel");
const logger = require("../config/logger");

exports.activateSubscription = async (payment) => {

    try {

        if (!payment || !payment._id || !payment.userId || !payment.planId) {
            throw new Error("Invalid payment payload");
        }

        /* ---------- IDEMPOTENCY CHECK ---------- */

        const existingSubscription = await purchasedSubscriptionModel
            .findOne({ paymentId: payment._id })
            .lean();

        if (existingSubscription) {
            return existingSubscription;
        }

        /* ---------- FETCH PLAN ---------- */

        const plan = await planModel.findById(payment.planId).lean();

        if (!plan) {
            throw new Error("Plan not found");
        }

        /* ---------- CALCULATE EXPIRY ---------- */

        let expiresAt = null;

        if (plan.validityDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + plan.validityDays);
        }

        /* ---------- EXPIRE OLD SUBSCRIPTIONS ---------- */

        await purchasedSubscriptionModel.updateMany(
            { userId: payment.userId, status: "active" },
            {
                status: "expired",
                expiredAt: new Date()
            }
        );

        /* ---------- CREATE SUBSCRIPTION (IDEMPOTENT UPSERT) ---------- */

        const subscription = await purchasedSubscriptionModel.findOneAndUpdate(
            { paymentId: payment._id },
            {
                $setOnInsert: {
                    userId: payment.userId,
                    planId: payment.planId,
                    paymentId: payment._id,
                    status: "active",
                    startsAt: new Date(),
                    expiresAt,
                    planSnapshot: {
                        name: plan.name,
                        price: plan.price,
                        credits: plan.credits,
                        validityDays: plan.validityDays
                    }
                }
            },
            {
                upsert: true,
                new: true
            }
        );

        /* ---------- CREDIT TOP-UP ---------- */

        if (plan.credits > 0) {

            const ledgerExists = await creditLedgerModel
                .findOne({ referenceId: payment._id })
                .lean();

            if (!ledgerExists) {

                const account = await creditAccountModel.findOneAndUpdate(
                    { userId: payment.userId },
                    {
                        $inc: {
                            balance: plan.credits,
                            totalCredited: plan.credits
                        }
                    },
                    {
                        upsert: true,
                        new: true
                    }
                );

                await creditLedgerModel.create({
                    userId: payment.userId,
                    type: "credit",
                    amount: plan.credits,
                    source: "subscription",
                    referenceId: payment._id,
                    balanceAfter: account.balance,
                    description: `Plan purchase: ${plan.name}`
                });

            }
        }

        return subscription;

    } catch (error) {

        throw new Error(`activateSubscription failed: ${error.message}`);

    }
};

// exports.activateSubscription = async (payment) => {

//     try {

//         logger.info(`Processing payment ${payment._id} for user ${payment.userId}`);

//         /* ---------- PREVENT DUPLICATE PROCESSING ---------- */

//         const existingSubscription = await purchasedSubscriptionModel
//             .findOne({ paymentId: payment._id })
//             .lean();

//         if (existingSubscription) {
//             logger.info(`Subscription already exists for payment ${payment._id}`);
//             return existingSubscription;
//         }

//         /* ---------- LOAD PLAN ---------- */

//         const plan = await planModel.findById(payment.planId).lean();

//         if (!plan) {
//             logger.error(`Plan not found ${payment.planId}`);
//             throw new Error("Plan not found");
//         }

//         /* ---------- CALCULATE EXPIRY ---------- */

//         let expiresAt = null;

//         if (plan.validityDays) {
//             expiresAt = new Date();
//             expiresAt.setDate(expiresAt.getDate() + plan.validityDays);
//         }

//         /* ---------- EXPIRE OLD SUBSCRIPTIONS ---------- */

//         await purchasedSubscriptionModel.updateMany(
//             { userId: payment.userId, status: "active" },
//             { status: "expired", expiredAt: new Date() }
//         );

//         logger.info(`Old subscriptions expired for user ${payment.userId}`);

//         /* ---------- CREATE SUBSCRIPTION (IDEMPOTENT) ---------- */

//         const subscription = await purchasedSubscriptionModel.findOneAndUpdate(
//             { paymentId: payment._id },
//             {
//                 $setOnInsert: {
//                     userId: payment.userId,
//                     planId: payment.planId,
//                     paymentId: payment._id,
//                     status: "active",
//                     startsAt: new Date(),
//                     expiresAt,
//                     planSnapshot: {
//                         name: plan.name,
//                         price: plan.price,
//                         credits: plan.credits,
//                         validityDays: plan.validityDays
//                     }
//                 }
//             },
//             {
//                 upsert: true,
//                 new: true
//             }
//         );

//         logger.info(`Subscription created ${subscription._id}`);

//         /* ---------- CREDIT TOPUP ---------- */

//         if (plan.credits > 0) {

//             const ledgerExists = await creditLedgerModel
//                 .findOne({ referenceId: payment._id })
//                 .lean();

//             if (!ledgerExists) {

//                 const account = await creditAccountModel.findOneAndUpdate(
//                     { userId: payment.userId },
//                     { $inc: { balance: plan.credits } },
//                     { upsert: true, new: true }
//                 );

//                 await creditLedgerModel.create({
//                     userId: payment.userId,
//                     type: "credit",
//                     amount: plan.credits,
//                     source: "subscription",
//                     referenceId: payment._id,
//                     balanceAfter: account.balance,
//                     description: `Plan purchase: ${plan.name}`
//                 });

//                 logger.info(
//                     `Credits added ${plan.credits} | user ${payment.userId} | balance ${account.balance}`
//                 );

//             } else {

//                 logger.warn(`Credits already processed for payment ${payment._id}`);

//             }
//         }

//         logger.info(`Subscription activated successfully user=${payment.userId}`);

//         return subscription;

//     } catch (error) {

//         logger.error(`activateSubscription failed: ${error.message}`);

//         throw error;
//     }
// };