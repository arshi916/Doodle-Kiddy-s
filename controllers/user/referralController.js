import User   from "../../models/userSchema.js";
import Coupon from "../../models/couponSchema.js";
import Wallet from "../../models/walletSchema.js";
import { creditWallet } from "./walletController.js";

const loadReferral = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect('/login');
        let user = await User.findById(userId).lean();
        if (!user) return res.redirect('/login');

        // Auto-generate referral code if missing
        if (!user.referralCode) {
            const newCode = user.name.toUpperCase().slice(0, 3) +
                Math.random().toString(36).substring(2, 7).toUpperCase();
            await User.findByIdAndUpdate(userId, { referralCode: newCode });
            user.referralCode = newCode;
        }

        const baseUrl       = req.protocol + '://' + req.get('host');
        const referralUrl   = `${baseUrl}/signup?ref=${user.referralCode}`;
        const referredCount = user.redeemedUsers ? user.redeemedUsers.length : 0;

        let couponDetails = null;
        if (user.referralCoupon) {
            couponDetails = await Coupon.findOne({ name: user.referralCoupon }).lean();
        }

        let walletBalance = 0, referralEarnings = 0;
        const wallet = await Wallet.findOne({ userId }).lean();
        if (wallet) {
            walletBalance     = wallet.balance || 0;
            referralEarnings  = (wallet.transactions || [])
                .filter(t => t.type === 'credit' && t.description?.toLowerCase().includes('referral'))
                .reduce((sum, t) => sum + (t.amount || 0), 0);
        }

        referralEarnings = (wallet.transactions || [])
    .filter(t => 
        t.type === 'credit' && 
        t.description && (
            t.description.toLowerCase().includes('referral') ||
            t.description.toLowerCase().includes('welcome bonus')
        )
    )
    .reduce((sum, t) => sum + (t.amount || 0), 0);

        res.render('user/referral', {
            user, referralCode: user.referralCode,
            referralUrl, referredCount, couponDetails,
            walletBalance, referralEarnings, activeTab: 'referral'
        });
    } catch (error) {
        console.error("Referral page error:", error);
        res.redirect('/pageNotFound');
    }
};

const validateReferralCode = async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.json({ valid: false });
        const referrer = await User.findOne({
            referralCode: code.toUpperCase().trim()
        }).lean();
        if (!referrer) return res.json({ valid: false, message: 'Invalid referral code' });
        return res.json({ valid: true, message: `Referred by ${referrer.name}` });
    } catch (error) {
        console.error("Validate referral error:", error);
        res.json({ valid: false });
    }
};

const getReferralInfo = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false });

        let user = await User.findById(userId);
        if (!user) return res.json({ success: false });

        if (!user.referralCode) {
            user.referralCode = user.name.toUpperCase().slice(0, 3) +
                Math.random().toString(36).substring(2, 7).toUpperCase();
            await user.save();
        }

        const baseUrl     = req.protocol + '://' + req.get('host');
        const referralUrl = `${baseUrl}/signup?ref=${user.referralCode}`;

        // FIX: use the actual saved array length
        const referredCount = user.redeemedUsers ? user.redeemedUsers.length : 0;

        let referralEarnings = 0;
        const wallet = await Wallet.findOne({ userId }).lean();
        if (wallet) {
            referralEarnings = (wallet.transactions || [])
                .filter(t => 
                    t.type === 'credit' && 
                    t.description && (
                        // FIX: case-insensitive, catches both "Referral reward" and "referral"
                        t.description.toLowerCase().includes('referral') ||
                        t.description.toLowerCase().includes('welcome bonus')
                    )
                )
                .reduce((s, t) => s + (t.amount || 0), 0);
        }

        res.json({
            success:         true,
            referralCode:    user.referralCode,
            referralUrl,
            referredCount,
            referralEarnings
        });
    } catch (error) {
        console.error('getReferralInfo error:', error);
        res.json({ success: false });
    }
};

export default { loadReferral, validateReferralCode, getReferralInfo };