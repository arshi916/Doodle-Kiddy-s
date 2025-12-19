const User = require("../../models/userSchema");
const bcrypt = require('bcrypt');
const customerInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 10; 

  
    const searchQuery = {
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    };

   

    const userData = await User.find(searchQuery)
    .select('name email profileImage isBlocked createdOn _id') 
      .sort({ 
        createdOn: -1, 
        _id: -1        
      })
      .limit(limit)
      .skip((page - 1) * limit);

      console.log('Users with profileImage:', userData.map(u => ({ id: u._id, profileImage: u.profileImage })));

    console.log('=== CUSTOMERS QUERY RESULTS ===');
    console.log('Search term:', search);
    console.log('Found customers:', userData.length);
    userData.forEach((user, index) => {
      console.log(`${index + 1}. Name: ${user.name}, Email: ${user.email}, GoogleID: ${user.googleID || 'None'}, Created: ${user.createdOn}, isAdmin: ${user.isAdmin}`);
    });

   
    const count = await User.countDocuments(searchQuery);

    res.render("admin/customers", {
      customers: userData,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      search,
      activePage: "customers",
    });
  } catch (error) {
    console.error("Error in customerInfo:", error);
    res.redirect("/pageerror");
  }
};

const toggleBlockStatus = async (req, res) => {
  try {
    const userId = req.body.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found!" });
    }

    if (user.isAdmin) {
      return res.status(403).json({ success: false, message: "Cannot block an admin user!" });
    }

    if (req.session.user && req.session.user._id.toString() === userId.toString()) {
      return res.status(403).json({ success: false, message: "You cannot block yourself!" });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Customer ${user.name} has been ${user.isBlocked ? 'blocked' : 'unblocked'} successfully!`,
      isBlocked: user.isBlocked
    });
  } catch (error) {
    console.error("Error in toggleBlockStatus:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Try again!" });
  }
};


const addCustomer = async (req, res) => {
  try {
    const { name, email, password, address } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ 
      name, 
      email, 
      password: hashedPassword, 
      address, 
      isAdmin: false,
      createdOn: new Date() 
    });
    res.redirect('/admin/customers');
  } catch (err) {
    console.error(err);
    res.redirect('/pageerror');
  }
};

const loadEditCustomer = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    res.render('admin/edit-customer', { customer: user });
  } catch (err) {
    res.redirect('/pageerror');
  }
};

const updateCustomer = async (req, res) => {
  try {
    const { name, email, address } = req.body;

    const updateData = {
      name,
      email,
      address,
    };
if (req.file) {
  const fileExtension = path.extname(req.file.originalname);
  const fileName = `profile_${req.params.id}_${Date.now()}${fileExtension}`;
  const finalPath = path.join(__dirname, '../../public/uploads/profiles', fileName);
  await sharp(req.file.buffer)
    .resize(300, 300, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 90 })
    .toFile(finalPath);
  updateData.profileImage = `/uploads/profiles/${fileName}`;
}
    await User.findByIdAndUpdate(req.params.id, updateData);

    res.redirect('/admin/customers');
  } catch (err) {
    console.error(err);
    res.redirect('/pageerror');
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const userId = req.body.userId;
    await User.findByIdAndUpdate(userId, { isDeleted: true });
    res.redirect('/admin/customers');
  } catch (err) {
    res.redirect('/pageerror');
  }
};

module.exports = {
  customerInfo,
  toggleBlockStatus,
  addCustomer,
  loadEditCustomer,
  updateCustomer,
  deleteCustomer,
};