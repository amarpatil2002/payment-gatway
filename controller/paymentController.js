const Cashfree = require("../config/cashfree");
const paymentModel = require("../model/paymentModel");
const planModel = require("../model/subscriptionPlanModel");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const crypto = require("crypto");


exports.createPaymentOrder = async (req, res) => {
    try {
        const { planId, userId, phone } = req.body;

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

        /* ---------- IDEMPOTENT CHECK ---------- */

        const existingPayment = await paymentModel.findOne({
            userId,
            planId,
            status: "pending",
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        }).lean();

        if (existingPayment) {
            return res.json({
                success: true,
                message: "Existing payment session",
                orderId: existingPayment.providerPaymentId
            });
        }

        /* ---------- CREATE ORDER ID ---------- */

        const orderId = `order_${uuidv4()}`;

        /* ---------- CREATE PAYMENT RECORD ---------- */

        await paymentModel.create({
            userId,
            planId,
            amount: plan.price,
            currency: "INR",
            status: "pending",
            provider: "cashfree",
            providerPaymentId: orderId,
            metadata: {
                planName: plan.name
            }
        });

        /* ---------- CREATE CASHFREE ORDER ---------- */

        const request = {
            order_id: orderId,
            order_amount: plan.price,
            order_currency: "INR",

            customer_details: {
                customer_id: userId,
                customer_phone: phone,
            },

            order_meta: {
                return_url: `${process.env.FRONTEND_URL}/payment-status?order_id={order_id}`
            }
        };

        const response = await Cashfree.PGCreateOrder("2023-08-01", request);
        return res.json({
            success: true,
            orderId,
            paymentSessionId: response.data.payment_session_id
        });

    } catch (error) {

        console.error("createPaymentOrder error:", error);

        return res.status(500).json({
            success: false,
            message: "Payment initialization failed"
        });
    }
};

exports.cashfreeWebhook = async (req, res) => {
    try {

        const signature = req.headers["x-webhook-signature"]
        const timestamp = req.headers["x-webhook-timestamp"]

        if (!signature || !timestamp) {
            return res.status(400).send("Missing signature headers")
        }

        const rawBody = req.body

        /* combine timestamp + body */
        const signedPayload = timestamp + rawBody.toString()

        const expectedSignature = crypto
            .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
            .update(signedPayload)
            .digest("base64")

        console.log("Signature:", signature)
        console.log("Expected :", expectedSignature)

        if (signature !== expectedSignature) {
            console.log("Invalid signature")
            return res.status(401).send("Invalid signature")
        }

        const payload = JSON.parse(req.body.toString());
        const eventType = payload?.type;                               // e.g. "PAYMENT_SUCCESS_WEBHOOK"
        const orderId = payload?.data?.order?.order_id;
        const paymentStatus = payload?.data?.payment?.payment_status;     // "SUCCESS" | "FAILED" | "PENDING"
        const cfPaymentId = payload?.data?.payment?.cf_payment_id;
        const paymentAmount = payload?.data?.payment?.payment_amount;

        if (!orderId) {
            return res.status(400).send("Invalid payload");
        }

        const payment = await paymentModel.findOne({
            providerPaymentId: orderId
        });

        if (!payment) {
            return res.status(404).send("Payment not found");
        }

        /* idempotency protection */
        if (payment.status === "success") {
            return res.status(200).send("Already processed");
        }

        // ── Handle SUCCESS ────────────────────────────────────────
        if (paymentStatus === "SUCCESS") {
            payment.status = "success";
            payment.metadata = { ...payment.metadata, cfPaymentId, paymentAmount, processedAt: new Date() };
            await payment.save();

            // ── Activate subscription (credits, expiry, etc.) ─────
            try {
                await activateSubscription(payment);
                logger.info(`Subscription activated for user ${payment.userId} | Order ${orderId}`);
            } catch (activationErr) {
                logger.error(`Subscription activation failed for ${orderId}: ${activationErr.message}`);
                // Don't return 500 — payment was already marked success; retry logic via webhook retries
            }

            return res.status(200).send("Webhook processed");
        }

        if (paymentStatus === "FAILED") {
            payment.status = "failed";
            payment.metadata = {
                ...payment.metadata,
                failureReason: payload?.data?.error_details?.error_description || "Payment failed",
                cfPaymentId
            };
            await payment.save();
            return res.status(200).send("Webhook processed");
        }

        return res.status(200).send("Webhook processed");

    } catch (error) {

        console.error("Webhook error:", error);
        return res.status(500).send("Webhook failed");

    }
};

exports.getOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const payment = await paymentModel
            .findOne({ providerPaymentId: orderId })
            .populate("planId", "name price validityDays credits")
            .lean();

        if (!payment) return res.status(404).json({ success: false, message: "Order not found" });

        return res.json({ success: true, data: payment });
    } catch (error) {
        logger.error(`getOrderStatus error: ${error.message}`);
        return res.status(500).json({ success: false, message: "Failed to fetch order status" });
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const [payments, total] = await Promise.all([
            paymentModel
                .find({ userId })
                .populate("planId", "name price")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            paymentModel.countDocuments({ userId })
        ]);

        return res.json({
            success: true,
            data: payments,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        logger.error(`getPaymentHistory error: ${error.message}`);
        return res.status(500).json({ success: false, message: "Failed to fetch payment history" });
    }
};