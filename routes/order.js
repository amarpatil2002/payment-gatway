
const router = require('express').Router()

const { createPaymentOrder, cashfreeWebhook } = require('../controller/paymentController');
const { getAllPlans, getPlan } = require('../controller/plans');

router.get('/all-plans', getAllPlans)
router.get('/plan/:planId', getPlan)

router.post("/create-order", createPaymentOrder);
router.post("/webhook/cashfree", cashfreeWebhook);

module.exports = router