const User = require("../../models/userSchema");

const countryStateData = {
  "India": [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", 
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", 
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", 
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", 
    "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh", 
    "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep", "Andaman and Nicobar Islands"
  ]
};

const loadAddresses = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    if (!user) return res.redirect("/login");

    res.render("user/addresses", { 
      user, 
      addresses: user.addresses || [],
      countries: Object.keys(countryStateData),
      countryStateData: JSON.stringify(countryStateData)
    });
  } catch (error) {
    console.error("Error loading addresses:", error);
    res.redirect("/pageerror");
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No data received. Please check form submission.' 
      });
    }
    
    const { 
      addressType, 
      name, 
      phone, 
      altPhone, 
      address,  
      city, 
      landMark, 
      state, 
      pincode, 
      isDefault 
    } = req.body;

    const requiredFields = { name, phone, address, city, state, pincode };
    const missingFields = [];
    
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || value.trim() === '') {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number must be exactly 10 digits' 
      });
    }

    const cleanPincode = pincode.toString().replace(/\D/g, '');
    if (cleanPincode.length !== 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN code must be exactly 6 digits' 
      });
    }

    let cleanAltPhone = '';
    if (altPhone && altPhone.trim() !== '') {
      cleanAltPhone = altPhone.toString().replace(/\D/g, '');
      if (cleanAltPhone.length !== 10) {
        return res.status(400).json({ 
          success: false, 
          message: 'Alternative phone number must be exactly 10 digits' 
        });
      }
      
      if (cleanAltPhone === cleanPhone) {
        return res.status(400).json({ 
          success: false, 
          message: 'Alternative phone cannot be the same as primary phone' 
        });
      }
    }

    if (landMark && landMark.trim().length > 100) {
      return res.status(400).json({ 
        success: false, 
        message: 'Landmark must not exceed 100 characters' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (!user.addresses) {
      user.addresses = [];
    }

    const makeDefault = user.addresses.length === 0 || isDefault === 'on' || isDefault === true;

    if (makeDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    const newAddress = {
      addressType: addressType || 'Home',
      name: name.trim(),
      phone: cleanPhone,
      altPhone: cleanAltPhone,
      address: address.trim(),
      city: city.trim(),
      landMark: landMark ? landMark.trim() : '',
      state: state.trim(),
      zipCode: cleanPincode,
      country: 'India',
      isDefault: makeDefault
    };

    user.addresses.push(newAddress);
    const savedUser = await user.save();
    
    const savedAddress = savedUser.addresses[savedUser.addresses.length - 1];

    res.json({ 
      success: true, 
      message: 'Address added successfully',
      addressId: savedAddress._id,
      address: savedAddress
    });

  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ 
      success: false, 
      message: `Server error: ${error.message}` 
    });
  }
};

const updateAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No data received' 
      });
    }
    
    const { 
      addressType, 
      name, 
      phone, 
      altPhone, 
      address, 
      city, 
      landMark, 
      state, 
      pincode, 
      isDefault 
    } = req.body;

    const requiredFields = { name, phone, address, city, state, pincode };
    const missingFields = [];
    
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || value.trim() === '') {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '');
    const cleanPincode = pincode.toString().replace(/\D/g, '');

    if (cleanPhone.length !== 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number must be exactly 10 digits' 
      });
    }

    if (cleanPincode.length !== 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN code must be exactly 6 digits' 
      });
    }

    let cleanAltPhone = '';
    if (altPhone && altPhone.trim() !== '') {
      cleanAltPhone = altPhone.toString().replace(/\D/g, '');
      if (cleanAltPhone.length !== 10) {
        return res.status(400).json({ 
          success: false, 
          message: 'Alternative phone number must be exactly 10 digits' 
        });
      }
      
      if (cleanAltPhone === cleanPhone) {
        return res.status(400).json({ 
          success: false, 
          message: 'Alternative phone cannot be the same as primary phone' 
        });
      }
    }

    if (landMark && landMark.trim().length > 100) {
      return res.status(400).json({ 
        success: false, 
        message: 'Landmark must not exceed 100 characters' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Address not found' 
      });
    }

    if (isDefault === 'on' || isDefault === true) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    user.addresses[addressIndex] = {
      ...user.addresses[addressIndex]._doc,
      addressType: addressType || 'Home',
      name: name.trim(),
      phone: cleanPhone,
      altPhone: cleanAltPhone,
      address: address.trim(),
      city: city.trim(),
      landMark: landMark ? landMark.trim() : '',
      state: state.trim(),
      zipCode: cleanPincode,
      country: user.addresses[addressIndex].country || 'India',
      isDefault: isDefault === 'on' || isDefault === true
    };

    await user.save();

    res.json({ 
      success: true, 
      message: 'Address updated successfully'
    });
    
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ 
      success: false, 
      message: `Server error: ${error.message}` 
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
      return res.json({ success: false, message: 'Address not found' });
    }

    const wasDefault = user.addresses[addressIndex].isDefault;
    user.addresses.splice(addressIndex, 1);

    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    res.json({ 
      success: true, 
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.json({ success: false, message: 'Error deleting address: ' + error.message });
  }
};

const getAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    const address = user.addresses.find(addr => addr._id.toString() === addressId);
    if (!address) {
      return res.json({ success: false, message: 'Address not found' });
    }

    res.json({ 
      success: true, 
      address
    });
  } catch (error) {
    console.error("Error getting address:", error);
    res.json({ success: false, message: 'Error getting address: ' + error.message });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    const addressIndex = user.addresses.findIndex(addr => addr._id.toString() === addressId);
    if (addressIndex === -1) {
      return res.json({ success: false, message: 'Address not found' });
    }

    user.addresses.forEach(addr => addr.isDefault = false);
    user.addresses[addressIndex].isDefault = true;

    await user.save();

    res.json({ 
      success: true, 
      message: 'Default address updated successfully'
    });
  } catch (error) {
    console.error("Error setting default address:", error);
    res.json({ success: false, message: 'Error setting default address: ' + error.message });
  }
};

module.exports = {
  loadAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getAddress,
  setDefaultAddress
};