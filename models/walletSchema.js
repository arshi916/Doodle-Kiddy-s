import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null
    },
    status: {
        type: String,
        enum: ['completed', 'pending', 'failed'],
        default: 'completed'
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    transactions: [walletTransactionSchema]
}, { timestamps: true });

const Wallet = mongoose.model('Wallet', walletSchema);
export default Wallet;