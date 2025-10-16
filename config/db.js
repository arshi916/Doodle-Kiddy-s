// db.js
const mongoose = require('mongoose');
require('dotenv').config(); // Ensure dotenv is loaded

const connectDB = async () => {
    try {
        console.log('MONGO_URI:', process.env.MONGO_URI); // Debug
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('DB connected');
    } catch (error) {
        console.log('DB connection error:', error.message);
        process.exit(1);
    }
};
module.exports = connectDB;