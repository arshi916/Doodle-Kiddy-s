const User = require("../../models/userSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");

// 404 Page
const pageNotFound = async (req, res) => {
    try {
        res.render('page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

// Load Signup Page
const loadSignup = async (req, res) => {
    try {
        return res.render('signup');
    } catch (error) {
        console.log('Signup page not loading:', error);
        res.status(500).send('Server Error');
    }
};

// Load Homepage
const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (userId) {
            const userData = await User.findOne({ _id: userId });
            return res.render("home", { user: userData }); // ✅ One return
        } else {
            return res.render("home", { user: null }); // ✅ One return
        }
    } catch (error) {
        console.log('Home page not found:', error);
        res.status(500).send('Server error');
    }
};


// Load Shopping Page
const loadShopping = async (req, res) => {
    try {
        return res.render('shop');
    } catch (error) {
        console.log('Shopping page not loading:', error);
        res.status(500).send('Server Error');
    }
};

// Generate OTP
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send Email
async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`,
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
}

// Signup Controller
const signup = async (req, res) => {
    try {
        const { name, email, phone, password, confirm_password } = req.body;

        console.log('Signup request received:', { name, email, phone });

        // Server-side validation
        if (!name || !email || !phone || !password || !confirm_password) {
            return res.render("signup", { message: "All fields are required" });
        }

        if (password !== confirm_password) {
            return res.render("signup", { message: "Passwords don't match" });
        }

        if (password.length < 8) {
            return res.render("signup", { message: "Password must be at least 8 characters long" });
        }

        if (phone.length !== 10 || !/^[0-9]+$/.test(phone)) {
            return res.render("signup", { message: "Phone number must be exactly 10 digits" });
        }

        // Check if user already exists
        const findUser = await User.findOne({ 
            $or: [
                { email: email },
                { phone: phone }
            ]
        });
        
        if (findUser) {
            if (findUser.email === email) {
                return res.render("signup", { message: "User with this email already exists" });
            }
            if (findUser.phone === phone) {
                return res.render("signup", { message: "User with this phone number already exists" });
            }
        }

        const otp = generateOtp();
        console.log("Generated OTP:", otp);

        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render("signup", { message: "Failed to send verification email. Please try again." });
        }

        // Store OTP and user data in session
        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password };
        
        console.log("OTP stored in session:", req.session.userOtp);
        console.log("User data stored in session:", req.session.userData);

        // Render OTP verification page
        res.render("verify-otp");
        console.log("Redirected to OTP verification page");
        
    } catch (error) {
        console.error("Signup error:", error);
        res.render("signup", { message: "An error occurred during signup. Please try again." });
    }
};

// Secure password
const securePassword = async (password) => {
    try {
        return await bcrypt.hash(password, 10);
    } catch (error) {
        console.error("Password hashing error:", error);
        throw error;
    }
};

// OTP Verification
const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        
        console.log("Received OTP:", otp);
        console.log("Session OTP:", req.session.userOtp);
        console.log("Session userData:", req.session.userData);

        if (!req.session.userOtp || !req.session.userData) {
            return res.status(400).json({ 
                success: false, 
                message: "Session expired. Please try signing up again." 
            });
        }

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await saveUserData.save();
            console.log("User saved to database:", saveUserData._id);
            
            // Set user session
            req.session.user = saveUserData._id;
            
            // Clear OTP and userData from session
            delete req.session.userOtp;
            delete req.session.userData;
            
            return res.json({ success: true, redirectUrl: "/" });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid OTP, please try again" 
            });
        }
    } catch (error) {
        console.error("Error Verifying OTP:", error);
        res.status(500).json({ 
            success: false, 
            message: "An error occurred while verifying OTP" 
        });
    }
};

// Resend OTP
const resendOtp = async (req, res) => {
    try {
        if (!req.session.userData) {
            return res.status(400).json({ 
                success: false, 
                message: "Session expired. Please try signing up again." 
            });
        }

        const newOtp = generateOtp();
        const emailSent = await sendVerificationEmail(req.session.userData.email, newOtp);
        
        if (!emailSent) {
            return res.status(500).json({ 
                success: false, 
                message: "Failed to send verification email" 
            });
        }

        req.session.userOtp = newOtp;
        console.log("New OTP sent:", newOtp);
        
        return res.json({ success: true, message: "OTP resent successfully" });
    } catch (error) {
        console.error("Error resending OTP:", error);
        res.status(500).json({ 
            success: false, 
            message: "An error occurred while resending OTP" 
        });
    }
};


const loadLogin = async (req, res) => {
    try {
        // If user is already logged in, redirect to home
        if (req.session.user) {
            return res.redirect("/");
        } else {
            return res.render("login");
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

const login = async (req,res)=>{
    try{

        const {email,password}= req.body;

        const findUser = await User.findOne({isAdmin:0,email:email});

        if(!findUser){

            return res.render("login",{message:"User not found"})
        }
        if(findUser.isBlocked){
            return res.render("login",{message:"User is blocked by Admin"})
        }

        const passwordMatch = await bcrypt.compare(password,findUser.password);

        if(!passwordMatch){
            return res.render("login",{message:"Incorrect password"})
        }

        req.session.user = findUser._id;
        res.redirect("/")

    }catch (error) {
        console.error("login error",error);
        res.render("login",{message:"login failed,please try again later"})

    }
}



const logout = async (req,res)=>{
    try {
        req.session.destroy((err)=>{
            if(err){
                console.log("Session destruction error" ,err.message);
            }
            return res.redirect('/login')
        })
    }catch (error){

        console.log("Logout error",error);
        res.redirect("/pageNotFound")
    }
}


module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadShopping,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout
};