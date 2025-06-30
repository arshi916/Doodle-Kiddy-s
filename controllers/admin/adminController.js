const User = require("../../models/userSchema"); 
const mongoose = require("mongoose"); 
const bcrypt = require("bcrypt");  

const pageerror = async (req, res) => {
    res.render("admin-error", {
        title: "Admin Error",
        message: "Something went wrong on the admin panel."
    });
};


const loadLogin = (req, res) => {      
    if (req.session.admin) {         
        return res.redirect("/admin"); // Redirect to admin dashboard
    }      
    res.render("admin-login", { message: null }); 
};    

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find admin user
        const admin = await User.findOne({ email, isAdmin: true });
        
        if (admin) {
            // Compare password correctly with await
            const passwordMatch = await bcrypt.compare(password, admin.password);
            
            if (passwordMatch) {
                req.session.admin = true;
                return res.redirect("/admin");
            } else {
                return res.render("admin-login", { message: "Invalid password" });
            }
        } else {
            return res.render("admin-login", { message: "Admin not found" });
        }
    } catch (error) {
        console.log("login error", error);
        return res.render("admin-login", { message: "Login error occurred" });
    }
};

const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            res.render("dashboard");  // dashboard.ejs inside views/admin/
        } catch (error) {
            console.log("Dashboard error:", error);
            res.redirect("/admin/login");
        }
    } else {
        res.redirect("/admin/login");
    }
};


const logout = async (req,res)=>{
    try{
req.session.destroy(err =>{
    if(err){
        console.log("Error destroying session");
        return res.redirect("/pageerror")
    }
    res.redirect("/admin/login")
})
    }catch (error){

        console.log(("unexpected error during logout",error));
        res.redirect("/pageerror")
    }
}




module.exports = {     
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout
};
 