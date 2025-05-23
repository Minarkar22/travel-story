import express from "express";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import cors from "cors";
import mongoose from "mongoose";
import User from "./models/user.model.js";
import TravelStory from "./models/travelStory.model.js";
import { authenticateToken } from "./utilities.js";
import { upload } from "./multer.js";
import { fileURLToPath } from "url";
import fs from "fs";
import path, { dirname, join } from "path";
import { start } from "repl";
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));

// user-create
app.post("/user-create", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res
      .status(400)
      .json({ error: true, message: "All fields are required" });
  }

  const isUser = await User.findOne({ email });
  if (isUser) {
    return res.status(400).json({ error: true, message: "User already exist" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({
    fullName,
    email,
    password: hashedPassword,
  });

  await user.save();

  const accessToken = jwt.sign(
    { userId: user._id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "72h",
    }
  );

  return res.status(201).json({
    error: false,
    user: { fullName: user.fullName, email: user.email },
    accessToken,
    message: "Registration Successful",
  });
});

//login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: true, message: "Email and Password are required!" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ error: true, message: "User Not found" });
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return res.status(400).json({ error: true, message: "Wrong password!" });
  }

  const accessToken = jwt.sign(
    { userId: user._id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "72h",
    }
  );

  return res.status(200).json({
    error: false,
    message: "Login Successful",
    user: { fullName: user.fullName, email: user.email },
    accessToken,
  });
});

// get-user
app.get("/get-user", authenticateToken, async (req, res) => {
  const { userId } = req.user;

  const isUser = await User.findOne({ _id: userId });

  if (!isUser) {
    return res.sendStatus(401);
  }

  return res.status(200).json({
    user: isUser,
    message: "User details retrieved successfully",
  });
});

// Route to handle image upload
app.post("/image-upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: true, message: "No image Uploaded" });
    }

    const imageUrl = `http://localhost:8080/uploads/${req.file.filename}`;

    res.status(201).json({ imageUrl });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

//To Delete an image from upload folder
app.delete("/delete-image", async (req, res) => {
  const { imageUrl } = req.query;

  if (!imageUrl) {
    return res
      .status(400)
      .json({ error: true, message: "imageUrl parameter is required" });
  }
  try {
    // Extract file name from the imageUrl
    const filename = path.basename(imageUrl);

    //Define the file path
    const filePath = path.join(__dirname, "uploads", filename);

    //Check if the file exits
    if (fs.existsSync(filePath)) {
      //Delete the file from the upload folder
      fs.unlinkSync(filePath);
      res.status(200).json({ message: "Image deleted successfully" });
    } else {
      res.status(200).json({ error: true, message: "Image not found" });
    }
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});
// Serve static files from the uploads and assets directory
app.use("/uploads", express.static(join(__dirname, "uploads")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

//Add travel story
app.post("/add-story", authenticateToken, async (req, res) => {
  const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
  const { userId } = req.user;

  if (!title || !story || !visitedLocation || !imageUrl || !visitedDate) {
    return res
      .status(400)
      .json({ error: true, message: "All fields are required!" });
  }

  // Convert visitedDate from milliseconds to Date object
  const parsedVisitedDate = new Date(parseInt(visitedDate));

  try {
    const travelStory = new TravelStory({
      title,
      story,
      visitedLocation,
      userId,
      imageUrl,
      visitedDate: parsedVisitedDate,
    });
    await travelStory.save();
    res.status(200).json({ story: travelStory, message: "Addes Successfully" });
  } catch (error) {
    res.status(400).json({ error: true, message: error.message });
  }
});

// Get all travel stories
app.get("/get-all-stories", authenticateToken, async (req, res) => {
  const { userId } = req.user;

  try {
    const travelStories = await TravelStory.find({ userId: userId }).sort({
      isFavourite: -1,
    });
    res.status(200).json({ stories: travelStories });
  } catch (error) {
    res.status(400).json({ error: true, message: error.message });
  }
});

//Edit Travel Story
app.post("/edit-story/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
  const { userId } = req.user;

  if (!title || !story || !visitedLocation || !visitedDate) {
    return res
      .status(400)
      .json({ error: true, message: "All fields are required" });
  }

  const parsedVisitedDate = new Date(parseInt(visitedDate));

  try {
    //Find the travel story by id and ensure it belongs to the authenticated user
    const travelStory = await TravelStory.findOne({ _id: id, userId: userId });
    if (!travelStory) {
      return res
        .status(404)
        .json({ error: true, message: "Travel story not found" });
    }

    const placeholderUrl = "http://localhost:8080/assets/placeholder.jpeg";

    travelStory.title = title;
    travelStory.story = story;
    travelStory.visitedLocation = visitedLocation;
    travelStory.imageUrl = imageUrl || placeholderUrl;
    travelStory.visitedDate = parsedVisitedDate;

    await travelStory.save();
    res.status(201).json({ story: travelStory, message: "Updated Successful" });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

//Delete Travel Story
app.delete("/delete-story/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;

  try {
    const travelStory = await TravelStory.findOne({ _id: id, userId: userId });
    if (!travelStory) {
      return res.status(404).json({ error: true, message: "Story not found!" });
    }

    //Delete travel story from database
    await travelStory.deleteOne({ _id: id, userId: userId });

    //To delete image file from uploads folder
    const imageUrl = travelStory.imageUrl;
    const filename = path.basename(imageUrl);
    const filePath = path.join(__dirname, "uploads", filename);
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("Failed to delete image file: ", err);
      }
    });

    res.status(201).json({ error: false, message: "Deleted Successfully" });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

//Update isFavourite
app.put("/update-isFavourite/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;
  const { isFavourite } = req.body;

  try {
    const travelStory = await TravelStory.findOne({ _id: id, userId: userId });
    if (!travelStory) {
      return res
        .status(404)
        .json({ error: true, message: "Travel story not found" });
    }

    travelStory.isFavourite = isFavourite;

    await travelStory.save();
    res
      .status(200)
      .json({ story: travelStory, message: "Update Successfully" });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

//Search travel stories
app.get("/search", authenticateToken, async (req, res) => {
  const { query } = req.query;
  const { userId } = req.user;

  if (!query) {
    return res.status(404).json({ error: true, message: "query is required!" });
  }

  try {
    const searchResults = await TravelStory.find({
      userId: userId,
      $or: [
        { title: { $regex: query, $options: "i" } },
        { story: { $regex: query, $options: "i" } },
        { visitedLocation: { $regex: query, $options: "i" } },
      ],
    }).sort({ isFavourite: -1 });

    res.status(200).json({ stories: searchResults });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

//Filter travel stories by date range
app.get("/travel-stories/filter", authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  const { userId } = req.user;

  try {
    const start = new Date(parseInt(startDate));
    const end = new Date(parseInt(endDate));

    const filteredStories = await TravelStory.find({
      userId: userId,
      visitedDate: { $gte: start, $lte: end },
    }).sort({ isFavourite: -1 });

    res.status(200).json({ stories: filteredStories });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});
//connect to db
mongoose.connect(process.env.MONGO_URI).then(() => {
  app.listen(process.env.PORT, () => {
    console.log(
      " Connect to Db and Server is listening on port " + process.env.PORT
    );
  });
});
