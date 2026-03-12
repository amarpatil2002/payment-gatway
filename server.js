const express = require('express')
const cors = require('cors')
require('dotenv').config()
const connectDB = require('./config/db')
const paymentRouter = require('./routes/order')

const port = 5000
const app = express();

(
    async function () {
        await connectDB()
    }
)()

app.use(cors({
    origin: ["http://localhost:5173"],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', paymentRouter)

app.listen(port, () => {
    console.log(`server listening at ${port}`);
})