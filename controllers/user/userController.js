import User from "../../models/userSchema.js";
import Category from "../../models/categorySchema.js";
import Product from "../../models/productSchema.js";
import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import razorpay from "../../config/razorpay.js";
import Coupon from "../../models/couponSchema.js";
import { creditWallet } from "./walletController.js";

const pageNotFound = async (req, res) => {
    try {
        res.render('user/page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const loadSignup = async (req, res) => {
    try {
        if (req.query.ref) {
            req.session.referralCode = req.query.ref.trim().toUpperCase();
        }
        return res.render('user/signup', { message: null });
    } catch (error) {
        console.log('Signup page not loading:', error);
        res.status(500).send('Server Error');
    }
};

const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('Loading homepage...');
        const categories = await Category.find({ isListed: true });
        console.log('Active categories found:', categories.length);
        if (categories.length === 0) {
            console.log('No active categories found');
            if (userId) {
                const userData = await User.findOne({ _id: userId });
                return res.render("user/home", { user: userData, products: [] });
            } else {
                return res.render("user/home", { products: [] });
            }
        }
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        })
        .populate('category', 'name isListed')
        .sort({ createdOn: -1 })
        .limit(4)
        .lean();
        console.log('Raw products found:', productData.length);
        productData = productData.filter(product =>
            product.category && product.category.isListed
        );
        console.log('Filtered products count:', productData.length);
        if (userId) {
            const userData = await User.findOne({ _id: userId });
            return res.render("user/home", { user: userData, products: productData });
        } else {
            return res.render("user/home", { products: productData });
        }
    } catch (error) {
        console.log('Home page error:', error);
        try {
            const userId = req.session.user;
            if (userId) {
                const userData = await User.findOne({ _id: userId });
                return res.render("user/home", { user: userData, products: [] });
            } else {
                return res.render("user/home", { products: [] });
            }
        } catch (renderError) {
            console.log('Error rendering fallback:', renderError);
            res.status(500).send('Server error');
        }
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });
        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            html: `<b>Your OTP: ${otp}</b>`,
        });
        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
}

const signup = async (req, res) => {
    try {
        const { name, email, phone, password, confirm_password } = req.body;
        if (!name || !email || !phone || !password || !confirm_password) {
            return res.render("user/signup", { message: "All fields are required" });
        }
        if (password !== confirm_password) {
            return res.render("user/signup", { message: "Passwords don't match" });
        }
        if (password.length < 8) {
            return res.render("user/signup", { message: "Password must be at least 8 characters long" });
        }
        if (/^0+$/.test(phone)) {
            return res.render("user/signup", { message: "Phone number cannot be all zeros" });
        }
        if (/^(\d)\1+$/.test(phone)) {
            return res.render("user/signup", { message: "Phone number cannot have all identical digits" });
        }
        if (phone.length !== 10 || !/^[0-9]+$/.test(phone)) {
            return res.render("user/signup", { message: "Phone number must be exactly 10 digits" });
        }
        const findUser = await User.findOne({ $or: [{ email }, { phone }] });
        if (findUser) {
            const message = findUser.email === email
                ? "User with this email already exists"
                : "User with this phone number already exists";
            return res.render("user/signup", { message });
        }
        const otp = generateOtp();
        console.log("Signup OTP for", email, "is:", otp);
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render("user/signup", { message: "Failed to send verification email" });
        }
        req.session.userOtp = otp;
req.session.userData = { 
    name, phone, email, password, 
    referredBy: req.body.referredBy?.trim().toUpperCase() 
             || req.session.referralCode 
             || null 
};
        res.render("user/verify-otp");
    } catch (error) {
        console.error("Signup error:", error);
        res.render("user/signup", { message: "An error occurred during signup" });
    }
};

const securePassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        if (!req.session.userOtp || !req.session.userData) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }
        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);
            const referralCode = user.name.toUpperCase().slice(0, 3) +
                Math.random().toString(36).substring(2, 7).toUpperCase();

            const saveUserData = new User({
                name:         user.name,
                email:        user.email,
                phone:        user.phone,
                password:     passwordHash,
                referralCode: referralCode,
                referredBy:   user.referredBy || null,
            });
            await saveUserData.save();

          if (user.referredBy) {
    try {
        const referrer = await User.findOne({ 
            referralCode: user.referredBy.trim().toUpperCase() 
        });
        
        console.log('Looking for referral code:', user.referredBy);
        console.log('Referrer found:', referrer ? referrer.email : 'NONE');

        if (referrer && referrer._id.toString() !== saveUserData._id.toString()) {
            
            const alreadyRedeemed = referrer.redeemedUsers.some(
                id => id.toString() === saveUserData._id.toString()
            );
            
            console.log('Already redeemed:', alreadyRedeemed);

console.log('user.referredBy value:', JSON.stringify(user.referredBy));
console.log('Searching for referralCode:', user.referredBy?.trim().toUpperCase());
            if (!alreadyRedeemed) {
               
                await creditWallet(
                    referrer._id,
                    100,
                    `Referral reward — ${saveUserData.name} joined using your code`,
                    null
                );
                console.log('Credited referrer ₹100');

                
                await creditWallet(
                    saveUserData._id,
                    50,
                    `Welcome bonus — joined via referral code`,
                    null
                );
                console.log('Credited new user ₹50');

                const updateResult = await User.findByIdAndUpdate(
                    referrer._id,
                    {
                        $push:  { redeemedUsers: saveUserData._id },
                        $set:   { redeemed: true }
                    },
                    { new: true }  // return updated document
                );
                
                console.log('Updated referrer redeemedUsers length:', 
                    updateResult?.redeemedUsers?.length);

                delete req.session.referralCode;
            }
        } else {
            console.log('Referrer not found or same user. Code was:', user.referredBy);
        }
    } catch (referralError) {
        console.error('Referral processing error:', referralError);
    }
}
            req.session.user = saveUserData._id;
            delete req.session.userOtp;
            delete req.session.userData;
            return res.json({ success: true, redirectUrl: "/" });

        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
    } catch (error) {
        console.error("Error verifying OTP:", error);
        res.status(500).json({ success: false, message: "Server error during OTP verification" });
    }
};

const resendOtp = async (req, res) => {
    try {
        if (!req.session.userData) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }
        const newOtp = generateOtp();
        console.log("Resent OTP:", newOtp);
        const sent = await sendVerificationEmail(req.session.userData.email, newOtp);
        if (!sent) {
            return res.status(500).json({ success: false, message: "Failed to resend OTP" });
        }
        req.session.userOtp = newOtp;
        return res.json({ success: true, message: "OTP resent successfully" });
    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "Error resending OTP" });
    }
};

const loadLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect("/");
        } else {
            return res.render("user/login", { message: null });
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ isAdmin: 0, email });
        if (!findUser) return res.render("user/login", { message: "User not found" });
        if (findUser.isBlocked) return res.render("user/login", { message: "User is blocked by Admin" });
        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) return res.render("user/login", { message: "Incorrect password" });
        req.session.user = findUser._id;
        res.redirect("/");
    } catch (error) {
        console.error("Login error", error);
        res.render("user/login", { message: "Login failed, please try again later" });
    }
};

const logout = async (req, res) => {
    try {
        req.logout(() => {});
        req.session.regenerate((err) => {
            if (err) console.log(err);
            res.clearCookie('connect.sid_user');
            res.redirect('/login');
        });
    } catch (e) {
        res.redirect('/pageNotFound');
    }
};

const loadForgotPassword = (req, res) => {
    try {
        res.render("user/forgot-password", { message: null, error: null });
    } catch (error) {
        console.error("Load forgot-password error:", error);
        res.redirect("/pageNotFound");
    }
};

const sendForgotOtp = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("user/forgot-password", { error: "User not found", message: null });
        }
        const otp = generateOtp();
        const sent = await sendVerificationEmail(email, otp);
        if (!sent) {
            return res.render("user/forgot-password", { error: "Failed to send OTP", message: null });
        }
        req.session.forgotOtp = otp;
        console.log("Forgot Password OTP for", email, "is:", otp);
        req.session.forgotEmail = email;
        res.redirect("/reset-otp");
    } catch (error) {
        console.error("Send forgot OTP error:", error);
        res.render("user/forgot-password", { error: "Something went wrong", message: null });
    }
};

const loadResetOtpPage = async (req, res) => {
    try {
        if (!req.session.forgotEmail) return res.redirect("/forgot-password");
        res.render("user/reset-otp", { message: null });
    } catch (error) {
        console.error("Load reset OTP page error:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyResetOtp = async (req, res) => {
    const { otp } = req.body;
    if (otp === req.session.forgotOtp) {
        req.session.userResetEmail = req.session.forgotEmail;
        delete req.session.forgotOtp;
        delete req.session.forgotEmail;
        return res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
};

const loadResetPasswordPage = (req, res) => {
    try {
        if (!req.session.userResetEmail) return res.redirect("/forgot-password");
        res.render("user/reset-password", { message: null });
    } catch (error) {
        console.error("Reset password page error:", error);
        res.redirect("/pageNotFound");
    }
};

const handleResetPassword = async (req, res) => {
    const { password, confirm_password } = req.body;
    if (!req.session.userResetEmail) {
        return res.status(400).json({ success: false, message: 'Session expired. Please restart the password reset process.' });
    }
    if (!password || !confirm_password) {
        return res.status(400).json({ success: false, message: 'Both password and confirm password are required' });
    }
    if (password !== confirm_password) {
        return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    const alphaLower = /[a-z]/;
    const alphaUpper = /[A-Z]/;
    const digit = /\d/;
    const special = /[!@#$%^&*(),.?":{}|<>]/;
    if (password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    if (!alphaLower.test(password)) return res.status(400).json({ success: false, message: 'Password must include at least one lowercase letter' });
    if (!alphaUpper.test(password)) return res.status(400).json({ success: false, message: 'Password must include at least one uppercase letter' });
    if (!digit.test(password)) return res.status(400).json({ success: false, message: 'Password must include at least one number' });
    if (!special.test(password)) return res.status(400).json({ success: false, message: 'Password must include at least one special character' });
    if (/^(.)\1+$/.test(password)) return res.status(400).json({ success: false, message: 'Password cannot be all identical characters' });
    try {
        const hashed = await bcrypt.hash(password, 10);
        const user = await User.findOneAndUpdate(
            { email: req.session.userResetEmail },
            { password: hashed },
            { new: true }
        );
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found. Please restart the password reset process.' });
        }
        delete req.session.userResetEmail;
        return res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password reset error:', error);
        return res.status(500).json({ success: false, message: 'Failed to reset password. Please try again.' });
    }
};

const resendForgotOtp = async (req, res) => {
    try {
        if (!req.session.forgotEmail) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }
        const otp = generateOtp();
        console.log("Resent Forgot Password OTP for", req.session.forgotEmail, "is:", otp);
        const sent = await sendVerificationEmail(req.session.forgotEmail, otp);
        if (!sent) {
            return res.status(500).json({ success: false, message: "Failed to resend OTP" });
        }
        req.session.forgotOtp = otp;
        return res.json({ success: true });
    } catch (error) {
        console.error("Resend forgot OTP error:", error);
        res.status(500).json({ success: false, message: "Something went wrong" });
    }
};

 const createRazorpayOrder = async (req, res) => {
  try {
    const amount = req.body.amount; 

    const options = {
      amount:   amount,            
      currency: "INR",
      receipt:  "order_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, order });

  } catch (error) {
    console.log("Razorpay Error:", error);
    res.status(500).json({ success: false });
  }
};
export default {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    verifyResetOtp,
    loadResetOtpPage,
    sendForgotOtp,
    loadForgotPassword,
    handleResetPassword,
    loadResetPasswordPage,
    resendForgotOtp,
    createRazorpayOrder
};