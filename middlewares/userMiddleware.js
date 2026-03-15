const User = require("../models/userSchema");

const userMiddleware = async (req, res, next) => {

    try {

        if (req.session.user) {

            const user = await User.findById(req.session.user);

            if (!user || user.isBlocked) {

                req.session.destroy();

                // AJAX request check
                if (req.xhr || req.headers.accept.includes('json')) {

                    return res.status(403).json({
                        success:false,
                        message:"Your account has been blocked by admin"
                    });

                }

                return res.redirect("/login?message=Your account has been blocked by admin");

            }

            res.locals.user = user;

        } else {

            res.locals.user = null;

        }

        next();

    } catch (error) {

        console.error("User middleware error:", error);

        next(error);

    }

};

module.exports = userMiddleware;