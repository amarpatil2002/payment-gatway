
const express = require('express')
const router = express.Router()


const { createPaymentOrder, getPaymentHistory, getOrderStatus } = require('../controller/paymentController');
const { getAllPlans, getPlan } = require('../controller/plans');

router.get('/all-plans', getAllPlans)
router.get('/plan/:planId', getPlan)

router.post("/create-order", createPaymentOrder);

router.get("/status/:orderId", getOrderStatus);
router.get("/history/:userId", getPaymentHistory);


module.exports = router