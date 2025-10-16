const User = require("../../models/userSchema"); 
const mongoose = require("mongoose"); 
const bcrypt = require("bcrypt");  

const pageerror = async (req, res) => {
    res.render("admin/admin-error", {
        title: "Admin Error",
        message: "Something went wrong on the admin panel."
    });
};

const loadLogin = (req, res) => {      
    console.log('Session on loadLogin:', req.session); // Debug
    if (req.session.admin) {         
        return res.redirect("/admin"); 
    }      
    res.render("admin/admin-login", { message: null });
};    

const login = async (req, res) => {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
        console.log('Admin not found for email:', email);
        return res.render("admin/admin-login", { message: "Invalid credentials" });
    }

    let isPasswordCorrect;
    if (admin.password.length < 20) {
        isPasswordCorrect = (password === admin.password);
    } else {
        isPasswordCorrect = await bcrypt.compare(password, admin.password);
    }

    if (!isPasswordCorrect) {
        console.log('Invalid password for email:', email);
        return res.render("admin/admin-login", { message: "Invalid credentials" });
    }

    req.session.admin = admin._id;
    console.log('Session set after login:', req.session); // Debug
    res.redirect("/admin");
};

const loadDashboard = async (req, res) => {
    console.log('Session on loadDashboard:', req.session); // Debug
    if (req.session.admin) {
        try {
            res.render("admin/admin-dashboard", {
                activePage: "dashboard"
            });
        } catch (error) {
            console.log("Dashboard error:", error);
            res.redirect("/admin/pageerror");
        }
    } else {
        console.log('No admin session, redirecting to login');
        res.redirect("/admin/login");
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.log("Error destroying session:", err);
                return res.redirect("/pageerror");
            }
            console.log('Session destroyed');
            res.redirect("/admin/login");
        });
    } catch (error) {
        console.log("Unexpected error during logout:", error);
        res.redirect("/pageerror");
    }
};

module.exports = {     
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout
};