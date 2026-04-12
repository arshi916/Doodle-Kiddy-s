import User from"../models/userSchema.js";

const userAuth = async (req, res, next) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const user = await User.findById(req.session.user);

        if (!user || user.isBlocked) {
            req.session.destroy(err => {
                if (err) console.log(err);
                return res.redirect("/login");
            });
        } else {
            req.user = user;
            next();
        }
    } catch (error) {
        console.log("Error in userAuth middleware", error);
        res.redirect("/login");
    }
};

const adminAuth = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      // ✅ Return JSON for AJAX/fetch, redirect for normal requests
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      return res.redirect("/admin/login");
    }

    const admin = await User.findById(req.session.admin);
    if (!admin || !admin.isAdmin) {
      req.session.destroy();
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      return res.redirect("/admin/login");
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.log("Error in adminAuth middleware", error);
    res.redirect("/admin/login");
  }
};

export {
    userAuth,
    adminAuth
};
