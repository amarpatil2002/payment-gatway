const Cashfree = require("../config/cashfree");
const paymentModel = require("../model/paymentModel");
const planModel = require("../model/subscriptionPlanModel");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const crypto = require("crypto");
const logger = require("../config/logger");
const { activateSubscription } = require("../services/subscriptionService");


// exports.createPaymentOrder = async (req, res) => {
//     try {
//         const { planId, userId, phone } = req.body;

//         /* ---------- VALIDATION ---------- */

//         if (!mongoose.Types.ObjectId.isValid(planId)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid planId"
//             });
//         }

//         const plan = await planModel.findById(planId).lean();

//         if (!plan) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Plan not found"
//             });
//         }

//         /* ---------- CLEANUP OLD PENDING PAYMENTS ---------- */

//         await paymentModel.updateMany(
//             {
//                 status: "pending",
//                 createdAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) }
//             },
//             { status: "expired" }
//         );

//         /* ---------- CHECK EXISTING PAYMENT ---------- */

//         const existingPayment = await paymentModel
//             .findOne({
//                 userId,
//                 planId,
//                 status: "pending"
//             })
//             .sort({ createdAt: -1 });

//         if (existingPayment && existingPayment.paymentSessionId) {
//             return res.json({
//                 success: true,
//                 message: "Existing payment session",
//                 orderId: existingPayment.providerOrderId,
//                 paymentSessionId: existingPayment.paymentSessionId
//             });
//         }

//         if (existingPayment && !existingPayment.paymentSessionId) {
//             await paymentModel.updateOne(
//                 { _id: existingPayment._id },
//                 { status: "expired" }
//             );
//         }

//         /* ---------- CREATE NEW ORDER ---------- */

//         const orderId = `ORD_${uuidv4()}`;
//         const providerOrderId = `CF_${uuidv4()}`;

//         const payment = await paymentModel.create({
//             userId,
//             planId,
//             amount: plan.price,
//             currency: "INR",
//             status: "pending",
//             provider: "cashfree",
//             orderId,
//             providerOrderId,
//             webhookProcessed: false,
//             metadata: {
//                 planName: plan.name
//             }
//         });

//         const request = {
//             order_id: providerOrderId,
//             order_amount: plan.price,
//             order_currency: "INR",

//             customer_details: {
//                 customer_id: userId,
//                 customer_phone: phone,
//                 customer_email: "test@example.com"
//             },

//             order_meta: {
//                 return_url: `${process.env.FRONTEND_URL}`
//             }
//         };

//         let response;

//         try {
//             response = await Cashfree.PGCreateOrder("2023-08-01", request);
//         } catch (err) {

//             console.error("Cashfree create order error:", err?.response?.data || err);

//             if (err?.response?.status === 409) {

//                 return res.status(409).json({
//                     success: false,
//                     message: "Payment order already exists"
//                 });

//             }

//             throw err;
//         }

//         const sessionId = response.data.payment_session_id;

//         await paymentModel.updateOne(
//             { _id: payment._id },
//             { paymentSessionId: sessionId }
//         );

//         return res.json({
//             success: true,
//             orderId: providerOrderId,
//             paymentSessionId: sessionId
//         });

//     } catch (error) {

//         console.error("createPaymentOrder error:", error?.response?.data || error);

//         return res.status(500).json({
//             success: false,
//             message: "Payment initialization failed"
//         });

//     }
// };

exports.createPaymentOrder = async (req, res) => {
    try {

        const { planId, userId, phone } = req.body;

        /* ---------- VALIDATION ---------- */

        if (!mongoose.Types.ObjectId.isValid(planId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid planId"
            });
        }

        const plan = await planModel.findById(planId).lean();

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found"
            });
        }

        /* ---------- EXPIRE OLD PENDING PAYMENTS ---------- */

        await paymentModel.updateMany(
            {
                status: "pending",
                createdAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) }
            },
            { status: "expired" }
        );

        /* ---------- GENERATE ORDER IDS ---------- */

        const orderId = `ORD_${uuidv4()}`;
        const providerOrderId = `CF_${uuidv4()}`;

        /* ---------- ATOMIC PAYMENT CREATION ---------- */

        const payment = await paymentModel.findOneAndUpdate(
            {
                userId,
                planId,
                status: "pending"
            },
            {
                $setOnInsert: {
                    userId,
                    planId,
                    amount: plan.price,
                    currency: "INR",
                    status: "pending",
                    provider: "cashfree",
                    orderId,
                    providerOrderId,
                    webhookProcessed: false,
                    metadata: {
                        planName: plan.name
                    }
                }
            },
            {
                new: true,
                upsert: true
            }
        );

        /* ---------- IF SESSION ALREADY EXISTS ---------- */

        if (payment.paymentSessionId) {

            return res.json({
                success: true,
                message: "Existing payment session",
                orderId: payment.providerOrderId,
                paymentSessionId: payment.paymentSessionId
            });

        }

        /* ---------- CREATE CASHFREE ORDER ---------- */

        const request = {

            order_id: payment.providerOrderId,
            order_amount: payment.amount,
            order_currency: "INR",

            customer_details: {
                customer_id: String(userId),
                customer_phone: phone,
                customer_email: email || "N/A"
            },

            order_meta: {
                return_url: `${process.env.FRONTEND_URL}/payment-status?order_id={order_id}`
            }

        };

        let response;

        try {

            response = await Cashfree.PGCreateOrder("2023-08-01", request);

        } catch (err) {

            console.error("Cashfree create order error:", err?.response?.data || err);

            if (err?.response?.status === 409) {
                return res.status(409).json({
                    success: false,
                    message: "Payment order already exists"
                });
            }

            throw err;
        }

        const sessionId = response.data.payment_session_id;

        /* ---------- SAVE SESSION ID ---------- */

        await paymentModel.updateOne(
            { _id: payment._id },
            { paymentSessionId: sessionId }
        );

        return res.json({
            success: true,
            orderId: payment.providerOrderId,
            paymentSessionId: sessionId
        });

    } catch (error) {

        console.error("createPaymentOrder error:", error?.response?.data || error);

        return res.status(500).json({
            success: false,
            message: "Payment initialization failed"
        });

    }
};


exports.cashfreeWebhook = async (req, res) => {
    try {

        const signature = req.headers["x-webhook-signature"];
        const timestamp = req.headers["x-webhook-timestamp"];

        if (!signature || !timestamp) {
            logger.warn("Webhook missing signature headers");
            return res.status(400).send("Missing signature headers");
        }

        const rawBody = req.body;

        /* ---------- SIGNATURE VERIFICATION ---------- */

        const signedPayload = timestamp + rawBody.toString();

        const expectedSignature = crypto
            .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
            .update(signedPayload)
            .digest("base64");

        const isValid = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );

        if (!isValid) {
            logger.warn("Invalid Cashfree webhook signature");
            return res.status(401).send("Invalid signature");
        }

        /* ---------- PARSE PAYLOAD ---------- */

        const payload = JSON.parse(rawBody.toString());

        const eventType = payload?.type;
        const orderId = payload?.data?.order?.order_id;
        const paymentStatus = payload?.data?.payment?.payment_status;
        const cfPaymentId = payload?.data?.payment?.cf_payment_id;
        const paymentAmount = payload?.data?.payment?.payment_amount;

        if (!orderId) {
            logger.warn("Webhook missing orderId");
            return res.status(400).send("Invalid payload");
        }

        /* ---------- FIND PAYMENT ---------- */

        const payment = await paymentModel.findOne({
            providerOrderId: orderId
        });

        if (!payment) {
            logger.error(`Payment not found for order ${orderId}`);
            return res.status(404).send("Payment not found");
        }

        /* ---------- IDEMPOTENCY PROTECTION ---------- */

        if (payment.webhookProcessed) {
            logger.info(`Webhook already processed ${orderId}`);
            return res.status(200).send("Already processed");
        }

        /* ---------- HANDLE SUCCESS ---------- */

        if (paymentStatus === "SUCCESS") {

            payment.status = "success";
            payment.providerPaymentId = cfPaymentId;
            payment.webhookProcessed = true;

            payment.metadata = {
                ...payment.metadata,
                paymentAmount,
                processedAt: new Date()
            };

            await payment.save();

            try {

                await activateSubscription(payment);

                logger.info(
                    `Subscription activated | user=${payment.userId} | order=${orderId}`
                );

            } catch (activationErr) {

                logger.error(
                    `Subscription activation failed ${orderId} : ${activationErr.message}`
                );

            }

            return res.status(200).send("Webhook processed");
        }

        /* ---------- HANDLE FAILURE ---------- */

        if (paymentStatus === "FAILED") {

            payment.status = "failed";
            payment.providerPaymentId = cfPaymentId;
            payment.webhookProcessed = true;

            payment.failureReason =
                payload?.data?.error_details?.error_description || "Payment failed";

            await payment.save();

            logger.info(`Payment failed order=${orderId}`);

            return res.status(200).send("Webhook processed");
        }

        /* ---------- OTHER EVENTS ---------- */

        logger.info(`Unhandled webhook event ${eventType}`);

        return res.status(200).send("Webhook processed");

    } catch (error) {

        logger.error(`Webhook error: ${error.message}`);

        return res.status(500).send("Webhook failed");
    }
};

exports.getOrderStatus = async (req, res) => {

    try {

        const { orderId } = req.params;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: "orderId is required"
            });
        }

        const payment = await paymentModel
            .findOne({ providerOrderId: orderId })
            .populate("planId", "name price validityDays credits")
            .select("status amount currency createdAt planId")
            .lean();

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        return res.json({
            success: true,
            data: payment
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: "Failed to fetch order status"
        });

    }

};

exports.getPaymentHistory = async (req, res) => {

    try {

        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
        }

        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 10;

        if (limit > 50) limit = 50;

        const skip = (page - 1) * limit;

        const [payments, total] = await Promise.all([

            paymentModel
                .find({ userId })
                .populate("planId", "name price")
                .select("status amount currency createdAt planId")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            paymentModel.countDocuments({ userId })

        ]);

        return res.json({
            success: true,
            data: payments,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: "Failed to fetch payment history"
        });

    }

};