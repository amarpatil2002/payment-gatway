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

        // const existingPayment = await paymentModel.findOne({
        //     userId,
        //     planId,
        //     status: "pending",
        //     createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        // }).lean();

        // if (existingPayment) {
        //     return res.json({
        //         success: true,
        //         message: "Existing payment session",
        //         orderId: existingPayment.providerPaymentId
        //     });
        // }

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
                // notify_url: `https://payment-gatway-oz0a.onrender.com/api/webhook/cashfree`,
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

        /* ---------- VERIFY SIGNATURE ---------- */

        const signature = req.headers["x-webhook-signature"];
        console.log(signature)
        if (!signature) {
            console.log("Test webhook received");
            return res.status(200).send("OK");
        }

        const expectedSignature = crypto
            .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
            .update(JSON.stringify(req.body))
            .digest("base64");

        if (signature !== expectedSignature) {
            return res.status(401).send("Invalid webhook signature");
        }

        /* ---------- EXTRACT DATA ---------- */

        const payload = req.body;
        console.log(payload)
        const orderId = payload?.data?.order?.order_id;
        const paymentStatus = payload?.data?.payment?.payment_status;
        const cfPaymentId = payload?.data?.payment?.cf_payment_id;

        if (!orderId) {
            return res.status(400).send("Invalid payload");
        }

        /* ---------- FIND PAYMENT ---------- */

        const payment = await paymentModel.findOne({
            providerPaymentId: orderId
        });

        if (!payment) {
            return res.status(404).send("Payment not found");
        }

        /* ---------- IDEMPOTENCY CHECK ---------- */

        if (payment.status === "success") {
            return res.status(200).send("Already processed");
        }

        /* ---------- HANDLE PAYMENT STATUS ---------- */

        if (paymentStatus === "SUCCESS") {

            payment.status = "success";
            payment.metadata = {
                ...payment.metadata,
                cfPaymentId
            };

            await payment.save();

            await activateSubscription(payment);

        }
        else if (paymentStatus === "FAILED") {
            payment.status = "failed";
            await payment.save();
        }
        else if (paymentStatus === "PENDING") {
            payment.status = "pending";
            await payment.save();
        }

        /* ---------- SUCCESS RESPONSE ---------- */

        res.status(200).send("Webhook processed");

    } catch (error) {

        console.error("Cashfree webhook error:", error);

        res.status(500).send("Webhook processing failed");
    }
};