const express = require('express')
const cors = require('cors')
require('dotenv').config()
const connectDB = require('./config/db')
const paymentRouter = require('./routes/order')

const port = process.env.PORT || 5000;

const app = express();

(
    async function () {
        await connectDB()
    }
)()

app.use(cors({
    origin: ["http://localhost:5173", "https://payment-frontend-102.vercel.app", "https://payment-frontend-101.vercel.app", "https://payment-frontend-o16m.onrender.coms"],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

/* ---------- CASHFREE WEBHOOK (RAW BODY) ---------- */
app.post(
    "/api/webhook/cashfree",
    express.raw({ type: "application/json" }),
    require("./controller/paymentController").cashfreeWebhook
);

/* ---------- NORMAL BODY PARSERS ---------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', paymentRouter)

app.listen(port, () => {
    console.log(`server listening at ${port}`);
})