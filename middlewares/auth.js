const User = require ("../models/userSchema");
const userAuth = (req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
            if(data && !data.isBlocked){
                next();
            }else{
                res.redirect('/login')
            }
        })
        .catch(error=>{
            console.log('Error in user auth middlewere');
            res.status(500).send('Internal Server error')
        })
    }else {
        res.redirect('/login')
    }
}
const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        User.findById(req.session.admin)
            .then(user => {
                if (user && user.isAdmin && !user.isBlocked) {
                    next();
                } else {
                    res.redirect("/admin/login");
                }
            })
            .catch(error => {
                console.log('Error in adminAuth middleware', error);
                res.status(500).send('Internal Server Error');
            });
    } else {
        res.redirect("/admin/login");
    }
};
const checkAuth = async (req, res, next) => {
  if (!req.session.user) {
    console.log("No session user, redirecting to /login");
    return res.redirect("/login");
  }

  const user = await User.findById(req.session.user._id);
  if (!user) {
    console.log("User not found, destroying session");
    req.session.destroy();
    return res.redirect("/login");
  }

  if (user.isAdmin) {
    console.log("Admin user, proceeding:", user._id);
    req.user = user;
    return next();
  }

  if (user.isBlocked) {
    console.log("Non-admin user is blocked, redirecting to /login:", user._id);
    req.session.destroy();
    return res.redirect("/login?message=Your account has been blocked");
  }

  req.user = user;
  next();
};

const checkAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    console.log("Not an admin, redirecting to /login");
    return res.redirect("/login");
  }
  next();
};

module.exports = { checkAuth, checkAdmin };
module.exports ={
    userAuth,
    adminAuth
}













