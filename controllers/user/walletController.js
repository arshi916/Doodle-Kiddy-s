import Wallet from "../../models/walletSchema.js";

export const getOrCreateWallet = async (userId) => {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
        wallet = new Wallet({ userId, balance: 0, transactions: [] });
        await wallet.save();
    }
    return wallet;
};

export const creditWallet = async (userId, amount, description, orderId = null) => {
    const wallet = await getOrCreateWallet(userId);
    wallet.balance = parseFloat((wallet.balance + amount).toFixed(2));
    wallet.transactions.push({
        type: 'credit',
        amount,
        description,
        orderId,
        date: new Date(),
        status: 'completed'
    });
    await wallet.save();
    return wallet;
};

export const debitWallet = async (userId, amount, description, orderId = null) => {
    const wallet = await getOrCreateWallet(userId);
    if (wallet.balance < amount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}`);
    }
    wallet.balance = parseFloat((wallet.balance - amount).toFixed(2));
    wallet.transactions.push({
        type: 'debit',
        amount,
        description,
        orderId,
        date: new Date(),
        status: 'completed'
    });
    await wallet.save();
    return wallet;
};

const loadWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: 'Not logged in' });

        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 8; 

        const wallet = await getOrCreateWallet(userId);
        const allTransactions = [...wallet.transactions].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
        );

        const total      = allTransactions.length;
        const totalPages = Math.ceil(total / limit);
        const start      = (page - 1) * limit;
        const transactions = allTransactions.slice(start, start + limit);

        return res.json({ 
            success: true, 
            balance: wallet.balance, 
            transactions,
            pagination: { page, totalPages, total, limit }
        });
    } catch (err) {
        console.error('Error loading wallet:', err);
        return res.json({ success: false, message: 'Error loading wallet' });
    }
};

export const getWalletBalance = async (req, res) => {
    try {
        const userId = req.session.user;
        const wallet = await Wallet.findOne({ userId }).lean();
        res.json({ 
            success: true, 
            balance: wallet ? (wallet.balance || 0) : 0 
        });
    } catch (error) {
        res.json({ success: false, balance: 0 });
    }
};

export default { loadWallet, getWalletBalance };

