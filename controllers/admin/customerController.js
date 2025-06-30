const User = require("../../models/userSchema");


const customerInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 3;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .limit(limit)
      .skip((page - 1) * limit);

    const count = await User.countDocuments({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    });

    res.render("customers", {
      customers: userData,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      search,
      activePage: "customers",
    });
  } catch (error) {
    res.redirect("/pageerror");
  }
};
const toggleBlockStatus = async (req, res) => {
  try {
    const userId = req.body.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect("/admin/customers");
    }

    user.isBlocked = !user.isBlocked; // toggle block status
    await user.save();

    res.redirect("/admin/customers");
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};


module.exports = {
    customerInfo,
     toggleBlockStatus,

}
