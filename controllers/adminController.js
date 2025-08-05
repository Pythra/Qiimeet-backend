const User = require("../models/User");
const Transaction = require("../models/Transaction");
const bcrypt = require('bcrypt');

// Get all users for admin panel
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('username email phone gender age location verificationStatus createdAt profilePictures')
      .sort({ createdAt: -1 }); // Most recent first
    
    res.json({
      success: true,
      users: users.map(user => ({
        id: user._id,
        displayName: user.username || 'N/A',
        name: user.username || 'N/A',
        phoneNumber: user.phone || 'N/A',
        emailAddress: user.email || 'N/A',
        status: user.verificationStatus === 'true' ? 'Active' : 'Pending',
        profilePicture: user.profilePictures && user.profilePictures.length > 0 
          ? user.profilePictures[0] 
          : null, 
        gender: user.gender || 'N/A',
        age: user.age || 'N/A',
        location: user.location || 'N/A',
        createdAt: user.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users' 
    });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+profilePictures');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        displayName: user.username || 'N/A',
        name: user.username || 'N/A',
        phoneNumber: user.phone || 'N/A',
        emailAddress: user.email || 'N/A',
        status: user.verificationStatus === 'true' ? 'Active' : 'Pending',
        profilePicture: user.profilePictures && user.profilePictures.length > 0 
          ? user.profilePictures[0] 
          : null,
        gender: user.gender || 'N/A',
        age: user.age || 'N/A',
        location: user.location || 'N/A',
        interests: user.interests || [],
        career: user.career || 'N/A',
        education: user.education || 'N/A',
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user' 
    });
  }
};

// Get all transactions for admin panel
exports.getAllTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({})
      .populate('user', 'username email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments({});

    res.json({
      success: true,
      transactions: transactions.map(transaction => ({
        id: transaction._id,
        userId: transaction.user ? transaction.user._id : null,
        userName: transaction.user ? transaction.user.username : 'Unknown User',
        userEmail: transaction.user ? transaction.user.email : 'N/A',
        userPhone: transaction.user ? transaction.user.phone : 'N/A',
        amount: transaction.amount,
        description: transaction.description,
        reference: transaction.reference || 'N/A',
        status: transaction.status || 'pending',
        type: transaction.type || 'N/A',
        paymentMethod: transaction.paymentMethod || 'N/A',
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch transactions' 
    });
  }
};

// Get transaction statistics for admin panel
exports.getTransactionStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Total transactions and amounts
    const totalTransactions = await Transaction.countDocuments({});
    const totalAmount = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Today's transactions
    const todayTransactions = await Transaction.countDocuments({
      createdAt: { $gte: startOfDay }
    });
    const todayAmount = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // This week's transactions
    const weekTransactions = await Transaction.countDocuments({
      createdAt: { $gte: startOfWeek }
    });
    const weekAmount = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // This month's transactions
    const monthTransactions = await Transaction.countDocuments({
      createdAt: { $gte: startOfMonth }
    });
    const monthAmount = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Transaction types breakdown
    const typeBreakdown = await Transaction.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, total: { $sum: '$amount' } } }
    ]);

    // Status breakdown
    const statusBreakdown = await Transaction.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      stats: {
        total: {
          transactions: totalTransactions,
          amount: totalAmount[0]?.total || 0
        },
        today: {
          transactions: todayTransactions,
          amount: todayAmount[0]?.total || 0
        },
        week: {
          transactions: weekTransactions,
          amount: weekAmount[0]?.total || 0
        },
        month: {
          transactions: monthTransactions,
          amount: monthAmount[0]?.total || 0
        },
        typeBreakdown,
        statusBreakdown
      }
    });
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch transaction statistics' 
    });
  }
};

// Get dashboard statistics for admin panel
exports.getDashboardStats = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments({});
    
    // Get active users count (users with verificationStatus === 'true')
    const activeUsers = await User.countDocuments({ verificationStatus: 'true' });
    
    // Get blocked users count (users with verificationStatus === 'false' or other status)
    const blockedUsers = await User.countDocuments({ 
      $or: [
        { verificationStatus: 'false' },
        { verificationStatus: { $ne: 'true' } }
      ]
    });

    // Get total earnings from transactions
    const totalEarnings = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get today's earnings
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEarnings = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get this week's earnings
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const weekEarnings = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get this month's earnings
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEarnings = await Transaction.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          blocked: blockedUsers
        },
        earnings: {
          total: totalEarnings[0]?.total || 0,
          today: todayEarnings[0]?.total || 0,
          week: weekEarnings[0]?.total || 0,
          month: monthEarnings[0]?.total || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch dashboard statistics' 
    });
  }
}; 

// Get all users for home screen with complete data
exports.getAllUsersForHome = async (req, res) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 }); // Most recent first
    
    res.json({
      success: true,
      users: users.map(user => ({
        _id: user._id,
        id: user._id,
        username: user.username,
        name: user.username || user.name,
        phone: user.phone,
        email: user.email,
        goal: user.goal,
        height: user.height,
        gender: user.gender,
        interests: user.interests,
        kids: user.kids,
        career: user.career,
        zodiac: user.zodiac,
        location: user.location,
        age: user.age,
        religon: user.religon,
        personality: user.personality,
        lifestyle: user.lifestyle,
        education: user.education,
        allowedConnections: user.allowedConnections,
        dateOfBirth: user.dateOfBirth,
        balance: user.balance,
        balanceUpdateHistory: user.balanceUpdateHistory,
        profilePictures: user.profilePictures,
        identityPictures: user.identityPictures,
        verificationStatus: user.verificationStatus,
        likes: user.likes,
        dislikes: user.dislikes,
        requesters: user.requesters,
        connections: user.connections,
        expoNotificationToken: user.expoNotificationToken,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        __v: user.__v
      }))
    });
  } catch (error) {
    console.error('Error fetching users for home:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users for home' 
    });
  }
};

// Get filtered users for home screen based on user preferences and connections
exports.getFilteredUsersForHome = async (req, res) => {
  try {
    console.log('getFilteredUsersForHome called with body:', req.body);
    const { 
      userId,
      ageRange,
      heightRange,
      location,
      languages,
      verifiedOnly,
      showNearbyOptions,
      showOthers,
      similarInterests,
      relationshipType,
      lifestyleChoices,
      educationLevel,
      zodiacSign,
      familyPlan,
      personality,
      religion
    } = req.body;

    // Get current user to filter out connections
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Build filter query
    let filterQuery = {};

    // Exclude current user
    filterQuery._id = { $ne: userId };

    // Exclude users who already have connections, likes, dislikes, and requesters
    const excludedUsers = [
      ...(currentUser.connections || []),
      ...(currentUser.likes || []),
      ...(currentUser.dislikes || []),
      ...(currentUser.requesters || [])
    ];
    
    if (excludedUsers.length > 0) {
      filterQuery._id = { 
        $ne: userId,
        $nin: excludedUsers
      };
    } else {
      filterQuery._id = { $ne: userId };
    }

    // Age filter
    if (ageRange && ageRange.length === 2) {
      filterQuery.age = { $gte: ageRange[0], $lte: ageRange[1] };
    }

    // Height filter
    if (heightRange && heightRange.length === 2) {
      filterQuery.height = { $gte: heightRange[0], $lte: heightRange[1] };
    }

    // Location filter
    if (location && location !== 'All') {
      filterQuery.location = location;
    }

    // Verified only filter
    if (verifiedOnly) {
      filterQuery.verificationStatus = 'true';
    }

    // Education level filter
    if (educationLevel && educationLevel !== 'All') {
      filterQuery.education = educationLevel;
    }

    // Zodiac sign filter
    if (zodiacSign && zodiacSign !== 'All') {
      filterQuery.zodiac = zodiacSign;
    }

    // Family plan filter
    if (familyPlan && familyPlan !== 'All') {
      filterQuery.kids = familyPlan;
    }

    // Personality filter
    if (personality && personality !== 'All') {
      filterQuery.personality = personality;
    }

    // Religion filter
    if (religion && religion !== 'All') {
      filterQuery.religon = religion;
    }

    // Lifestyle choices filter
    if (lifestyleChoices && lifestyleChoices.length > 0) {
      filterQuery.lifestyle = { $in: lifestyleChoices };
    }

    // Relationship type filter
    if (relationshipType && relationshipType !== 'All') {
      filterQuery.goal = relationshipType;
    }

    // Similar interests filter
    if (similarInterests && currentUser.interests && currentUser.interests.length > 0) {
      filterQuery.interests = { $in: currentUser.interests };
    }

    // Only include users with profile pictures
    filterQuery.profilePictures = { 
      $exists: true, 
      $ne: null,
      $not: { $size: 0 }
    };

    const users = await User.find(filterQuery)
      .sort({ createdAt: -1 });

    // Sort users by location priority - same location first
    const sortedUsers = users.sort((a, b) => {
      const currentUserLocation = currentUser.location || '';
      const userALocation = a.location || '';
      const userBLocation = b.location || '';

      // Check if locations match (case-insensitive)
      const aMatchesLocation = currentUserLocation.toLowerCase() === userALocation.toLowerCase();
      const bMatchesLocation = currentUserLocation.toLowerCase() === userBLocation.toLowerCase();

      if (aMatchesLocation && !bMatchesLocation) {
        return -1; // User A comes first (same location)
      } else if (!aMatchesLocation && bMatchesLocation) {
        return 1; // User B comes first (same location)
      } else {
        return 0; // Both have same location status, maintain original order
      }
    });

    console.log('Filtered users found:', sortedUsers.length);
    res.json({
      success: true,
      users: sortedUsers.map(user => ({
        _id: user._id,
        id: user._id,
        username: user.username,
        name: user.username || user.name,
        phone: user.phone,
        email: user.email,
        goal: user.goal,
        height: user.height,
        gender: user.gender,
        interests: user.interests,
        kids: user.kids,
        career: user.career,
        zodiac: user.zodiac,
        location: user.location,
        age: user.age,
        religon: user.religon,
        personality: user.personality,
        lifestyle: user.lifestyle,
        education: user.education,
        allowedConnections: user.allowedConnections,
        dateOfBirth: user.dateOfBirth,
        balance: user.balance,
        balanceUpdateHistory: user.balanceUpdateHistory,
        profilePictures: user.profilePictures,
        identityPictures: user.identityPictures,
        verificationStatus: user.verificationStatus,
        likes: user.likes,
        dislikes: user.dislikes,
        requesters: user.requesters,
        connections: user.connections,
        expoNotificationToken: user.expoNotificationToken,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        __v: user.__v
      }))
    });
  } catch (error) {
    console.error('Error fetching filtered users for home:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch filtered users for home',
      details: error.message 
    });
  }
}; 

// Create a new admin user
exports.createAdmin = async (req, res) => {
  try {
    const { email, username, password, role } = req.body;
    if (!email || !username || !password || !role) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    const allowedRoles = ['superadmin', 'admin', 'moderator', 'support'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }
    // Check if email or username already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email or username already exists' });
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new User({
      email,
      username,
      password: hashedPassword,
      role,
      isAdmin: true,
      verificationStatus: 'true',
    });
    await newAdmin.save();
    res.status(201).json({ success: true, admin: { id: newAdmin._id, email, username, role } });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ success: false, error: 'Failed to create admin' });
  }
}; 

// List all admin users
exports.getAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: { $ne: 'user' } })
      .select('username email role createdAt');
    res.json({
      success: true,
      admins: admins.map(admin => ({
        id: admin._id,
        email: admin.email,
        username: admin.username,
        role: admin.role,
        createdAt: admin.createdAt,
      }))
    });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch admins' });
  }
}; 