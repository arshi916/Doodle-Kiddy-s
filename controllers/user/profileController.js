const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const mongoose = require('mongoose');
const sharp = require("sharp");
const fs = require("fs");
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');

// Countries and States data
const countryStateData = {
  "India": [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", 
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", 
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", 
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", 
    "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh", 
    "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep", "Andaman and Nicobar Islands"
  ],
  "United States": [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", 
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", 
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", 
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", 
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", 
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", 
    "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", 
    "Wisconsin", "Wyoming"
  ],
  "Canada": [
    "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", 
    "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", 
    "Quebec", "Saskatchewan", "Yukon"
  ],
  "United Kingdom": [
    "England", "Scotland", "Wales", "Northern Ireland"
  ],
  "Australia": [
    "Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", 
    "South Australia", "Tasmania", "Victoria", "Western Australia"
  ]
};

const loadProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    if (!user) return res.redirect("/login");

   const isGoogleUser = !!user.googleID;
res.render("user/profile", {
  user,
  activeTab: 'personal'  ,
  isGoogleUser
});

  } catch (error) {
    console.error("Error loading profile:", error);
    res.redirect("/pageerror");
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const { name, email, phone } = req.body;

    if (phone) {
      const cleanPhone = phone.toString().replace(/\D/g, '');
      
   
      if (cleanPhone.length !== 10) {
        return res.json({ 
          success: false, 
          message: 'Phone number must be exactly 10 digits'          
        });
      }

  
      if (/^0+$/.test(cleanPhone)) {
        return res.json({ 
          success: false, 
          message: 'Phone number cannot be all zeros' 
        });
      }

   
      const duplicateCheck = await User.findOne({ 
        phone: cleanPhone, 
        _id: { $ne: userId } 
      });

      if (duplicateCheck) {
        return res.json({ 
          success: false,
          message: 'This phone number is already registered with another account.' 
        });
      }

    
      const user = await User.findById(userId);
      const hasDuplicateInAddresses = user.addresses && user.addresses.some(addr => 
        addr.phone && addr.phone.toString().replace(/\D/g, '') === cleanPhone
      );

      if (hasDuplicateInAddresses) {
        return res.json({ 
          success: false, 
          message: 'This phone number is already used in one of your addresses. Please use a different number.' 
        });
      }

   
      if (user.phone && user.phone.toString().replace(/\D/g, '') === cleanPhone) {
        await User.findByIdAndUpdate(userId, {
          name: name?.trim(),
          email: email?.trim(),
       
        });
        return res.json({ success: true, message: 'Profile updated successfully' });
      }
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.trim();
    if (phone) updateData.phone = phone.toString().replace(/\D/g, '');

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: {
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone ? `+91 ${updatedUser.phone}` : null
      }
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

const updateAvatar = async (req, res) => {
  try {
    const userId = req.session.user;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const userDir = path.join(__dirname, '../../public/uploads/profiles');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const fileExtension = path.extname(req.file.originalname);
    const fileName = `profile_${userId}_${Date.now()}${fileExtension}`;
    const finalPath = path.join(userDir, fileName);

    await sharp(req.file.buffer)
      .resize(300, 300, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 90 })
      .toFile(finalPath);
    console.log('File saved at:', finalPath);

    const currentUser = await User.findById(userId);
    if (currentUser && currentUser.profileImage && currentUser.profileImage !== '/images/default-avatar.jpg') {
      const oldImagePath = path.join(__dirname, '../../public', currentUser.profileImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const imagePath = `/uploads/profiles/${fileName}`;
    await User.findByIdAndUpdate(userId, { profileImage: imagePath });

    res.json({ 
      success: true, 
      message: 'Profile picture updated successfully',
      imagePath: imagePath
    });
  } catch (error) {
    console.error("Error updating avatar:", error);
    res.status(500).json({ success: false, message: 'Error updating profile picture' });
  }
};

const removeAvatar = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);

    if (user && user.profileImage && user.profileImage !== '/images/default-avatar.jpg') {
     
      const oldImagePath = path.join(__dirname, '../../public', user.profileImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }

      
      await User.findByIdAndUpdate(userId, { 
        profileImage: '/images/default-avatar.jpg' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Profile picture removed successfully' 
    });

  } catch (error) {
    console.error("Error removing avatar:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error removing profile picture' 
    });
  }
};

const sendEmailOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.json({ success: false, message: 'Email already in use.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.changeEmailOtp = otp;
    req.session.changeEmailOtpExpiry = Date.now() + 5 * 60 * 1000;
    req.session.newEmail = newEmail;
    req.session.otpSentAt = Date.now();

    if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
      throw new Error('Email credentials are missing in .env file');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
      logger: true,
      debug: true,
    });

    await transporter.verify((error, success) => {
      if (error) {
        console.error('Transporter verification failed:', error);
        throw error;
      }
      console.log('Server is ready to send emails:', success);
    });

    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: newEmail,
      subject: 'Verify Your New Email',
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
    });

    res.json({ success: true, message: 'OTP sent to new email.' });
  } catch (error) {
    console.error('Error sending email OTP:', error);
    res.json({
      success: false,
      message: error.message || 'Error sending OTP. Please check your email credentials.',
    });
  }
};

const resendEmailOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;

    const timeSinceLastOtp = Date.now() - (req.session.otpSentAt || 0);
    if (timeSinceLastOtp < 60000) {
      const remainingTime = Math.ceil((60000 - timeSinceLastOtp) / 1000);
      return res.json({
        success: false,
        message: `Please wait ${remainingTime} seconds before requesting a new OTP.`,
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.changeEmailOtp = otp;
    req.session.changeEmailOtpExpiry = Date.now() + 5 * 60 * 1000;
    req.session.otpSentAt = Date.now();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
      logger: true,
      debug: true,
    });

    await transporter.verify((error, success) => {
      if (error) {
        console.error('Transporter verification failed:', error);
        throw error;
      }
      console.log('Server is ready to send emails:', success);
    });

    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: newEmail,
      subject: 'Verify Your New Email - Resent',
      text: `Your new OTP is ${otp}. It expires in 5 minutes.`,
    });

    res.json({
      success: true,
      message: 'New OTP sent successfully.',
      canResendAfter: Date.now() + 60000,
    });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.json({
      success: false,
      message: 'Error resending OTP. Please try again.',
    });
  }
};
const verifyEmailOtp = async (req, res) => {
  try {
    const { newEmail, otp } = req.body;
    if (Date.now() > req.session.changeEmailOtpExpiry || otp !== req.session.changeEmailOtp || newEmail !== req.session.newEmail) {
      return res.json({ success: false, message: 'Invalid or expired OTP.' });
    }

    await User.findByIdAndUpdate(req.session.user, { email: newEmail });
    delete req.session.changeEmailOtp;
    delete req.session.changeEmailOtpExpiry;
    delete req.session.newEmail;

    res.json({ success: true });
  } catch (error) {
    console.error('Error verifying email OTP:', error);
    res.json({ success: false, message: 'Error updating email.' });
  }
};


const checkPhoneDuplicate = async (req, res) => {
  try {
    const userId = req.session.user;
    const { phone } = req.body;

    if (!phone) {
      return res.json({ success: false, message: 'Phone number is required' });
    }


    const cleanPhone = phone.toString().replace(/\D/g, '');
   
    if (cleanPhone.length !== 10) {
      return res.json({ 
        success: false, 
        message: 'Phone number must be exactly 10 digits' 
      });
    }

    if (/^0+$/.test(cleanPhone)) {
      return res.json({ 
        success: false, 
        message: 'Phone number cannot be all zeros' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    if (user.phone && user.phone.toString().replace(/\D/g, '') === cleanPhone) {
      return res.json({ success: true, message: 'Phone number is already your current number' });
    }

    const hasDuplicate = user.addresses && user.addresses.some(addr => 
      addr.phone && addr.phone.toString().replace(/\D/g, '') === cleanPhone
    );

    if (hasDuplicate) {
      return res.json({ 
        success: false, 
        message: 'This phone number is already used in one of your addresses. Please use a different number.' 
      });
    }
    const existingUser = await User.findOne({ 
      phone: cleanPhone, 
      _id: { $ne: userId } 
    });

    if (existingUser) {
      return res.json({ 
        success: false, 
        message: 'This phone number is already registered with another account.' 
      });
    }

    res.json({ success: true, message: 'Phone number is available' });
  } catch (error) {
    console.error("Error checking phone duplicate:", error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
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
      countryStateData: JSON.stringify(countryStateData),
      activeTab: 'addresses'
    });
  } catch (error) {
    console.error("Error loading addresses:", error);
    res.redirect("/pageerror");
  }
};

const addAddress = async (req, res) => {
  try {
    console.log('=== ADD ADDRESS DEBUG ===');
    console.log('Request body:', req.body);
    console.log('========================');
    
    const userId = req.session.user;
    
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('Request body is empty or undefined');
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

    console.log('Extracted values:', {
      addressType, name, phone, address, city, state, pincode, isDefault
    });

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
      // Check if altPhone is same as primary phone
      if (cleanAltPhone === cleanPhone) {
        return res.status(400).json({ 
          success: false, 
          message: 'Alternative phone cannot be the same as primary phone' 
        });
      }
    }

    // Optional landMark validation
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

    console.log('Creating new address:', newAddress);

    user.addresses.push(newAddress);
    const savedUser = await user.save();
    
    const savedAddress = savedUser.addresses[savedUser.addresses.length - 1];

    console.log('Address saved successfully:', savedAddress._id);

    res.json({ 
      success: true, 
      message: 'Address added successfully',
      addressId: savedAddress._id,
      address: savedAddress
    });

  } catch (error) {
    console.error("Error adding address:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: `Server error: ${error.message}` 
    });
  }
};

const updateAddress = async (req, res) => {
  try {
    console.log('=== UPDATE ADDRESS DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Address ID:', req.params.id);
    console.log('===========================');
    
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
      // Check if altPhone is same as primary phone
      if (cleanAltPhone === cleanPhone) {
        return res.status(400).json({ 
          success: false, 
          message: 'Alternative phone cannot be the same as primary phone' 
        });
      }
    }

    // Optional landMark validation
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



const getStates = async (req, res) => {
  try {
    const { country } = req.query;
    const states = countryStateData[country] || [];
    res.json({ success: true, states });
  } catch (error) {
    console.error("Error getting states:", error);
    res.json({ success: false, states: [] });
  }
};

const verifyCurrentPassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.json({ success: false, message: 'Current password is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    if (!user.password) {
      return res.json({ 
        success: false, 
        message: 'This account was created with Google sign-in and does not have a password. Please use Google sign-in to access your account.' 
      });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.json({ success: false, message: 'Current password is incorrect' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Generated OTP for password change: ${otp}`); // Log OTP to console
    req.session.passwordChangeOtp = otp;
    req.session.passwordChangeOtpExpiry = Date.now() + 5 * 60 * 1000;
    req.session.passwordOtpSentAt = Date.now();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: user.email,
      subject: 'Password Change Verification - OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #D4B896; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h2>Password Change Request</h2>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Hello ${user.name},</p>
            <p>We received a request to change your password. Please use the OTP below to verify this request:</p>
            
            <div style="background-color: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; border: 2px solid #D4B896;">
              <h1 style="color: #D4B896; margin: 0; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
            </div>
            
            <p><strong>This OTP will expire in 5 minutes.</strong></p>
            <p>If you didn't request this password change, please ignore this email and ensure your account is secure.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      `,
    });

    res.json({ 
      success: true, 
      message: 'Current password verified. OTP sent to your email.' 
    });

  } catch (error) {
    console.error('Error verifying current password:', error);
    res.json({ 
      success: false, 
      message: 'Error verifying password. Please try again.' 
    });
  }
};

const resendPasswordOtp = async (req, res) => {
  try {
    const userId = req.session.user;

    const timeSinceLastOtp = Date.now() - (req.session.passwordOtpSentAt || 0);
    if (timeSinceLastOtp < 60000) {
      const remainingTime = Math.ceil((60000 - timeSinceLastOtp) / 1000);
      return res.json({
        success: false,
        message: `Please wait ${remainingTime} seconds before requesting a new OTP.`,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Resent OTP for password change: ${otp}`);
    req.session.passwordChangeOtp = otp;
    req.session.passwordChangeOtpExpiry = Date.now() + 5 * 60 * 1000; 
    req.session.passwordOtpSentAt = Date.now();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: user.email,
      subject: 'Password Change Verification - New OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #D4B896; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h2>New Password Change OTP</h2>
          </div>
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Hello ${user.name},</p>
            <p>You requested a new OTP for password change verification:</p>
            
            <div style="background-color: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; border: 2px solid #D4B896;">
              <h1 style="color: #D4B896; margin: 0; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
            </div>
            
            <p><strong>This OTP will expire in 5 minutes.</strong></p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      `,
    });

    res.json({ 
      success: true, 
      message: 'New OTP sent successfully.' 
    });

  } catch (error) {
    console.error('Error resending password OTP:', error);
    res.json({ 
      success: false, 
      message: 'Error resending OTP. Please try again.' 
    });
  }
};


const changePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const { otp, newPassword } = req.body;

    if (!otp || !newPassword) {
      return res.json({ success: false, message: 'OTP and new password are required' });
    }

    if (otp.length !== 6) {
      return res.json({ success: false, message: 'OTP must be 6 digits' });
    }

    if (newPassword.length < 8) {
      return res.json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    if (!req.session.passwordChangeOtp || 
        !req.session.passwordChangeOtpExpiry || 
        Date.now() > req.session.passwordChangeOtpExpiry) {
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (otp !== req.session.passwordChangeOtp) {
      return res.json({ success: false, message: 'Invalid OTP. Please check and try again.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    if (user.password) {
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return res.json({ 
          success: false, 
          message: 'New password must be different from your current password' 
        });
      }
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await User.findByIdAndUpdate(userId, { 
      password: hashedPassword 
    });

    delete req.session.passwordChangeOtp;
    delete req.session.passwordChangeOtpExpiry;
    delete req.session.passwordOtpSentAt;

    try {
      const transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.NODEMAILER_EMAIL,
          pass: process.env.NODEMAILER_PASSWORD,
        },
      });

      await transporter.sendMail({
        from: process.env.NODEMAILER_EMAIL,
        to: user.email,
        subject: 'Password Changed Successfully',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
              <h2>Password Changed Successfully</h2>
            </div>
            <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <p>Hello ${user.name},</p>
              <p>Your password has been successfully changed at <strong>${new Date().toLocaleString()}</strong>.</p>
              
              <div style="background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>Security Tip:</strong> Keep your password safe and don't share it with anyone.
              </div>
              
              <p>If you didn't make this change, please contact our support team immediately.</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
    }

    res.json({ 
      success: true, 
      message: 'Password changed successfully!' 
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.json({ 
      success: false, 
      message: 'Error changing password. Please try again.' 
    });
  }
};

const Order = require("../../models/orderSchema");

const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    
    console.log('=== DEBUG: Loading orders ===');
    console.log('User ID:', userId);
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated',
        orders: []
      });
    }
    
    // Query orders
    const orders = await Order.find({ address: userId })
      .populate('orderedItemes.product', 'productName productImage finalPrice')
      .sort({ createdOn: -1 })
      .lean();

    console.log('Orders found:', orders ? orders.length : 0);
    
    // If no orders found
    if (!orders || orders.length === 0) {
      console.log('No orders found for user');
      return res.json({ 
        success: true, 
        orders: [],
        message: 'No orders found'
      });
    }

    // Log first order to see its structure
    if (orders.length > 0) {
      console.log('First order structure:', JSON.stringify(orders[0], null, 2));
    }

    // Transform orders safely
    const transformedOrders = orders.map((order, index) => {
      try {
        console.log(`Processing order ${index + 1}/${orders.length}`);
        
        // SAFE handling of orderId
        let orderNumber = 'N/A';
        let orderIdValue = 'N/A';
        
        if (order.orderId) {
          orderIdValue = String(order.orderId);
          orderNumber = orderIdValue.length >= 8 
            ? orderIdValue.slice(-8).toUpperCase() 
            : orderIdValue.toUpperCase();
        } else if (order._id) {
          orderIdValue = order._id.toString();
          orderNumber = orderIdValue.slice(-8).toUpperCase();
        }
        
        console.log(`Order ID: ${orderIdValue}, Order Number: ${orderNumber}`);
        
        // SAFE handling of items
        const items = Array.isArray(order.orderedItemes) 
          ? order.orderedItemes.map(item => {
              const product = item.product || {};
              return {
                productId: product._id || null,
                productName: product.productName || 'Product not found',
                quantity: item.quantity || 0,
                price: item.price || 0,
                totalPrice: (item.price || 0) * (item.quantity || 0),
                productImage: (product.productImage && Array.isArray(product.productImage) && product.productImage.length > 0)
                  ? `/images/${product.productImage[0]}` 
                  : '/images/default-product.jpg'
              };
            })
          : [];
        
        // SAFE handling of item count
        const itemCount = Array.isArray(order.orderedItemes)
          ? order.orderedItemes.reduce((sum, item) => sum + (item.quantity || 0), 0)
          : 0;
        
        return {
          _id: order._id,
          orderId: orderIdValue,
          orderNumber: orderNumber,
          totalPrice: order.totalPrice || 0,
          finalAmount: order.finalAmount || 0,
          discount: order.discount || 0,
          status: order.status || 'Pending',
          createdOn: order.createdOn || new Date(),
          invoiceDate: order.invoiceDate || null,
          items: items,
          itemCount: itemCount
        };
      } catch (itemError) {
        console.error(`Error processing order ${index}:`, itemError);
        // Return a safe default for this order
        return {
          _id: order._id || 'unknown',
          orderId: 'ERROR',
          orderNumber: 'ERROR',
          totalPrice: 0,
          finalAmount: 0,
          discount: 0,
          status: 'Error',
          createdOn: new Date(),
          invoiceDate: null,
          items: [],
          itemCount: 0
        };
      }
    });

    console.log('Transformed orders count:', transformedOrders.length);
    console.log('=== DEBUG: Orders loaded successfully ===');

    res.json({ 

      
      success: true, 
      orders: transformedOrders
    });

  } catch (error) {
    console.error("=== ERROR loading orders ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("===========================");
    
    res.status(500).json({ 
      success: false, 
      message: 'Error loading orders: ' + error.message,
      orders: []
    });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.id;

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    })
      .populate('orderedItemes.product', 'productName productImage finalPrice description')
      .lean();

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const user = await User.findById(userId).lean();
    let shippingAddress = null;
    
    if (order.selectedAddressId && user.addresses) {
      shippingAddress = user.addresses.find(addr => 
        addr._id.toString() === order.selectedAddressId.toString()
      );
    }
    
    if (!shippingAddress && user.addresses && user.addresses.length > 0) {
      shippingAddress = user.addresses.find(addr => addr.isDefault) || user.addresses[0];
    }

    // FIX: Safely handle orderId
    let orderNumber;
    if (order.orderId && typeof order.orderId === 'string') {
      orderNumber = order.orderId.slice(-8).toUpperCase();
    } else {
      orderNumber = order._id.toString().slice(-8).toUpperCase();
    }

    const transformedOrder = {
      _id: order._id,
      orderId: order.orderId || order._id.toString(),
      orderNumber: orderNumber,
      totalPrice: order.totalPrice || 0,
      finalAmount: order.finalAmount || 0,
      discount: order.discount || 0,
      status: order.status || 'Pending',
      createdOn: order.createdOn,
      invoiceDate: order.invoiceDate,
      items: (order.orderedItemes || []).map(item => {
        const product = item.product || {};
        return {
          itemId: item._id ? item._id.toString() : null,
          productId: product._id || null,
          productName: product.productName || 'Product not found',
          quantity: item.quantity || 0,
          price: item.price || 0,
          totalPrice: (item.price || 0) * (item.quantity || 0),
          status: item.status || order.status,
          productImage: product.productImage && product.productImage.length > 0
            ? `/images/${product.productImage[0]}` 
            : '/images/default-product.jpg'
        };
      }),
      shippingAddress: shippingAddress ? {
        name: shippingAddress.name,
        address: shippingAddress.address,
        city: shippingAddress.city,
        state: shippingAddress.state,
        zipCode: shippingAddress.zipCode,
        phone: shippingAddress.phone
      } : null
    };

    res.json({ 
      success: true, 
      order: transformedOrder 
    });

  } catch (error) {
    console.error("Error getting order details:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error loading order details: ' + error.message
    });
  }
};

const generateInvoice = async (req, res) => {
    try {
        const userId = req.session.user;
        const orderId = req.params.id;

        const order = await Order.findOne({ _id: orderId, address: userId })
            .populate('orderedItemes.product', 'productName productImage finalPrice description')
            .lean();

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const latexContent = `
            \\documentclass[a4paper,12pt]{article}
            \\usepackage[utf8]{inputenc}
            \\usepackage{geometry}
            \\geometry{a4paper, margin=1in}
            \\usepackage{fancyhdr}
            \\usepackage{lastpage}
            \\usepackage{graphicx}
            \\usepackage{array}
            \\usepackage{booktabs}
            \\usepackage{colortbl}
            \\usepackage{xcolor}
            \\pagestyle{fancy}
            \\fancyhf{}
            \\fancyhead[L]{Invoice}
            \\fancyhead[R]{Order #${order.orderId.slice(-8).toUpperCase()}}
            \\fancyfoot[C]{Page \\thepage\\ of \\pageref{LastPage}}
            \\fancyfoot[R]{Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}}
            \\begin{document}

            \\begin{center}
            \\textbf{\\Large Kids Fashion Store}\\\\
            \\small Online Shopping Platform\\\\ 
            \\today
            \\end{center}

            \\vspace{1cm}

            \\begin{tabular}{p{3cm} p{8cm}}
            \\textbf{Billed to:} & \\textbf{Shipping Address:} \\\\
            ${user.name} & ${order.shippingAddress ? order.shippingAddress.name : user.name} \\\\
            ${user.email} & ${order.shippingAddress ? order.shippingAddress.address : ''} \\\\
            ${user.phone} & ${order.shippingAddress ? `${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.zipCode}` : ''} \\\\
            & ${order.shippingAddress ? order.shippingAddress.phone : user.phone} \\\\
            \\end{tabular}

            \\vspace{1cm}

            \\begin{table}[h]
            \\centering
            \\begin{tabular}{p{4cm} p{2cm} p{2cm} p{2cm}}
            \\toprule
            \\rowcolor{lightgray} \\textbf{Product Name} & \\textbf{Quantity} & \\textbf{Price (₹)} & \\textbf{Total (₹)} \\\\
            \\midrule
            ${order.orderedItemes.map(item => `
                ${item.product.productName} & ${item.quantity} & ${item.price.toFixed(2)} & ${(item.price * item.quantity).toFixed(2)} \\\\
            `).join('')}
            \\midrule
            \\rowcolor{lightgray} \\textbf{Subtotal} & & & ${order.totalPrice.toFixed(2)} \\\\
            \\rowcolor{lightgray} \\textbf{Discount} & & & ${order.discount.toFixed(2)} \\\\
            \\rowcolor{lightgray} \\textbf{Total} & & & \\textbf{${order.finalAmount.toFixed(2)}} \\\\
            \\bottomrule
            \\end{tabular}
            \\end{table}

            \\vspace{1cm}

            \\textbf{Order Status:} ${order.status}\\\\
            \\textbf{Order Date:} ${new Date(order.createdOn).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}

            \\end{document}
        `;

        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const latexFilePath = path.join(tempDir, `invoice_${orderId}.tex`);
        fs.writeFileSync(latexFilePath, latexContent);

        const pdfFilePath = path.join(tempDir, `invoice_${orderId}.pdf`);
        exec(`latexmk -pdf -output-directory=${tempDir} ${latexFilePath}`, (error) => {
            if (error) {
                console.error('Error generating PDF:', error);
                return res.status(500).json({ success: false, message: 'Error generating invoice' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=invoice_${orderId}.pdf`);
            res.sendFile(pdfFilePath, () => {
                
                fs.unlinkSync(latexFilePath);
                fs.unlinkSync(pdfFilePath);
            });
        });

    } catch (error) {
        console.error("Error generating invoice:", error);
        res.status(500).json({ success: false, message: 'Error generating invoice' });
    }
};


const returnOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, reason, comments } = req.body;

    if (!orderId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID and reason are required' 
      });
    }

  
    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    });

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    
    if (order.status !== 'Delivered') {
      return res.json({ 
        success: false, 
        message: 'Only delivered orders can be returned' 
      });
    }

  
    const deliveryDate = order.invoiceDate || order.createdOn;
    const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceDelivery > 7) {
      return res.json({ 
        success: false, 
        message: 'Return window has expired. Returns must be requested within 7 days of delivery.' 
      });
    }

   
    order.status = 'Return Request';
    order.returnReason = reason;
    order.returnComments = comments;
    order.returnRequestedDate = new Date();
    order.updatedAt = new Date();

    await order.save();

    
    const user = await User.findById(userId);
    if (user && user.email) {
      try {
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: process.env.NODEMAILER_EMAIL,
          to: user.email,
          subject: `Return Request Received - Order #${order.orderId.slice(-8).toUpperCase()}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #D4B896; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                <h2>Return Request Received</h2>
              </div>
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>Hello ${user.name},</p>
                <p>We have received your return request for Order #${order.orderId.slice(-8).toUpperCase()}.</p>
                
                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #D4B896; margin-top: 0;">Return Details</h3>
                  <p><strong>Reason:</strong> ${reason}</p>
                  ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
                  <p><strong>Request Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
                </div>
                
                <p>Our team will review your request and get back to you within 1-2 business days.</p>
                <p>Once approved, we will arrange for pickup of the item(s).</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                  <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Error sending return confirmation email:', emailError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Return request submitted successfully. We will review it shortly.' 
    });

  } catch (error) {
    console.error("Error processing return request:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing return request. Please try again.' 
    });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, reason, comments } = req.body;

    if (!orderId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID and reason are required' 
      });
    }

  
    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    }).populate('orderedItemes.product');

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

   
    if (!['Pending', 'Processing'].includes(order.status)) {
      return res.json({ 
        success: false, 
        message: 'Orders can only be cancelled before shipping. Please contact support for assistance.' 
      });
    }

  
    for (const item of order.orderedItemes) {
      if (item.product && item.product._id) {
        await Product.findByIdAndUpdate(
          item.product._id,
          { $inc: { quantity: item.quantity } }
        );
      }
    }

    order.status = 'Cancelled';
    order.cancellationReason = reason;
    order.cancellationComments = comments;
    order.cancelledDate = new Date();
    order.updatedAt = new Date();

    await order.save();

    const user = await User.findById(userId);
    if (user && user.email) {
      try {
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: process.env.NODEMAILER_EMAIL,
          to: user.email,
          subject: `Order Cancelled - Order #${order.orderId.slice(-8).toUpperCase()}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                <h2>Order Cancelled</h2>
              </div>
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>Hello ${user.name},</p>
                <p>Your order #${order.orderId.slice(-8).toUpperCase()} has been cancelled as requested.</p>
                
                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #dc3545; margin-top: 0;">Cancellation Details</h3>
                  <p><strong>Reason:</strong> ${reason}</p>
                  ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
                  <p><strong>Cancellation Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
                  <p><strong>Refund Amount:</strong> ₹${order.finalAmount.toFixed(2)}</p>
                </div>
                
                <div style="background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <strong>Refund Information:</strong>
                  <p style="margin: 10px 0 0 0;">Your refund will be processed within 5-7 business days to your original payment method.</p>
                </div>
                
                <p>We're sorry to see you cancel this order. If you have any questions, please don't hesitate to contact our support team.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                  <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Error sending cancellation email:', emailError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Order cancelled successfully. Refund will be processed within 5-7 business days.' 
    });

  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cancelling order. Please try again.' 
    });
  }
};

// These functions are already in your code - just verify they're exactly like this
const cancelOrderItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, itemId, reason, comments } = req.body;

    if (!orderId || !itemId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID, Item ID and reason are required' 
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    }).populate('orderedItemes.product');

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (!['Pending', 'Processing'].includes(order.status)) {
      return res.json({ 
        success: false, 
        message: 'Items can only be cancelled before shipping.' 
      });
    }

    const itemIndex = order.orderedItemes.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.json({ 
        success: false, 
        message: 'Item not found in order' 
      });
    }

    const item = order.orderedItemes[itemIndex];

    // Check if item is already cancelled
    if (item.status === 'Cancelled') {
      return res.json({ 
        success: false, 
        message: 'This item has already been cancelled' 
      });
    }

    // Restore product stock
    if (item.product && item.product._id) {
      await Product.findByIdAndUpdate(
        item.product._id,
        { $inc: { quantity: item.quantity } }
      );
    }

    // Calculate refund amount for this item
    const itemRefund = item.price * item.quantity;

    // Mark item as cancelled
    order.orderedItemes[itemIndex].status = 'Cancelled';
    order.orderedItemes[itemIndex].cancellationReason = reason;
    order.orderedItemes[itemIndex].cancellationComments = comments;
    order.orderedItemes[itemIndex].cancelledDate = new Date();

    // Update order totals
    order.totalPrice -= itemRefund;
    order.finalAmount -= itemRefund;

    // If all items are cancelled, cancel the entire order
    const allItemsCancelled = order.orderedItemes.every(
      item => item.status === 'Cancelled'
    );

    if (allItemsCancelled) {
      order.status = 'Cancelled';
    }

    order.updatedAt = new Date();
    await order.save();

    // Send email notification
    const user = await User.findById(userId);
    if (user && user.email) {
      try {
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: process.env.NODEMAILER_EMAIL,
          to: user.email,
          subject: `Item Cancelled - Order #${order.orderId.slice(-8).toUpperCase()}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                <h2>Item Cancelled</h2>
              </div>
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>Hello ${user.name},</p>
                <p>An item from your order #${order.orderId.slice(-8).toUpperCase()} has been cancelled.</p>
                
                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #dc3545; margin-top: 0;">Cancelled Item</h3>
                  <p><strong>Product:</strong> ${item.product ? item.product.productName : 'Product'}</p>
                  <p><strong>Quantity:</strong> ${item.quantity}</p>
                  <p><strong>Reason:</strong> ${reason}</p>
                  ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
                  <p><strong>Refund Amount:</strong> ₹${itemRefund.toFixed(2)}</p>
                </div>
                
                <p>Your refund will be processed within 5-7 business days.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                  <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Error sending cancellation email:', emailError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Item cancelled successfully. Refund will be processed within 5-7 business days.' 
    });

  } catch (error) {
    console.error("Error cancelling order item:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error cancelling item. Please try again.' 
    });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, itemId, reason, comments } = req.body;

    if (!orderId || !itemId || !reason) {
      return res.json({ 
        success: false, 
        message: 'Order ID, Item ID and reason are required' 
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      address: userId 
    }).populate('orderedItemes.product');

    if (!order) {
      return res.json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const itemIndex = order.orderedItemes.findIndex(
      item => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.json({ 
        success: false, 
        message: 'Item not found in order' 
      });
    }

    const item = order.orderedItemes[itemIndex];

    // Check if item is already returned or has a return request
    if (item.status === 'Return Request' || item.status === 'Returned') {
      return res.json({ 
        success: false, 
        message: 'A return request has already been submitted for this item' 
      });
    }

    // Check if item is delivered
    if (item.status !== 'Delivered' && order.status !== 'Delivered') {
      return res.json({ 
        success: false, 
        message: 'Only delivered items can be returned' 
      });
    }

    // Check return window (7 days)
    const deliveryDate = order.invoiceDate || order.createdOn;
    const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceDelivery > 7) {
      return res.json({ 
        success: false, 
        message: 'Return window has expired. Returns must be requested within 7 days of delivery.' 
      });
    }

    // Mark item for return
    order.orderedItemes[itemIndex].status = 'Return Request';
    order.orderedItemes[itemIndex].returnReason = reason;
    order.orderedItemes[itemIndex].returnComments = comments;
    order.orderedItemes[itemIndex].returnRequestedDate = new Date();

    order.updatedAt = new Date();
    await order.save();

    // Send email notification
    const user = await User.findById(userId);
    if (user && user.email) {
      try {
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: process.env.NODEMAILER_EMAIL,
          to: user.email,
          subject: `Return Request Received - Order #${order.orderId.slice(-8).toUpperCase()}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #D4B896; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                <h2>Return Request Received</h2>
              </div>
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>Hello ${user.name},</p>
                <p>We have received your return request for an item from Order #${order.orderId.slice(-8).toUpperCase()}.</p>
                
                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #D4B896; margin-top: 0;">Return Details</h3>
                  <p><strong>Product:</strong> ${item.product ? item.product.productName : 'Product'}</p>
                  <p><strong>Quantity:</strong> ${item.quantity}</p>
                  <p><strong>Reason:</strong> ${reason}</p>
                  ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
                  <p><strong>Request Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
                </div>
                
                <p>Our team will review your request and get back to you within 1-2 business days.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                  <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Error sending return confirmation email:', emailError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Return request submitted successfully. We will review it shortly.' 
    });

  } catch (error) {
    console.error("Error processing return request:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing return request. Please try again.' 
    });
  }
};

module.exports = {
  loadProfile,
  updateProfile,
  updateAvatar,
  removeAvatar,
  sendEmailOtp,
  resendEmailOtp,
  verifyEmailOtp,
  loadAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getAddress,
  getStates,
  setDefaultAddress,
  verifyCurrentPassword,
  changePassword,
  resendPasswordOtp,
    loadOrders,
  getOrderDetails,
  generateInvoice,
    returnOrder,
  cancelOrder,
    cancelOrderItem,    
  returnOrderItem,  
   checkPhoneDuplicate 
};