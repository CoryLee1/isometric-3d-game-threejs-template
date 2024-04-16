require('dotenv').config();
// the express package will run our server
const express = require("express");
const app = express();
app.use(express.static("public")); // this line tells the express app to 'serve' the public folder to clients

// HTTP will expose our server to the web
const http = require("http").createServer(app);

// start our server listening on port 8080 for now (this is standard for HTTP connections)
const server = app.listen(8080);
console.log("Server is running on http://localhost:8080");

/////SOCKET.IO///////
const io = require("socket.io")().listen(server);

const peers = {};
const usernames = {};
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const SerpApi = require("google-search-results-nodejs");
const search = new SerpApi.GoogleSearch(process.env.SERPAPI_API_KEY);

async function generateURL(prompt) {
  const generationConfig = {
    stopSequences: ["red"],
    maxOutputTokens: 200,
    temperature: 0.95,
    topP: 0.1,
    topK: 16,
  };

  const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro-001" });

  try {
    // 使用 Gemini 根据对话总结关键词
    const keywordResult = await model.generateContent(
      `Based on the following dialogue:\n${prompt}\nPlease summarize the main topic or keyword of the conversation in one or two words.`,
      generationConfig
    );
    const keywordResponse = await keywordResult.response;
    const keyword = keywordResponse.text();
    console.log("Generated keyword:", keyword);

    // 使用 Google Search API 搜索相关 URL
    const params = {
      q: keyword,
      location: "New York, New York, United States",
      hl: "en",
      gl: "us",
      google_domain: "google.com",
    };

    const callback = function (data) {
      const firstResult = data["organic_results"][0];
      const url = firstResult["link"];
      console.log("Generated URL:", url);
      return url;
    };

    search.json(params, callback);
  } catch (error) {
    console.error("Error generating URL:", error);
    return null;
  }
}
io.on("connection", (socket) => {
  console.log(
    "Someone joined our server using socket.io.  Their socket id is",
    socket.id
  );
  usernames[socket.id] = 'User' + Math.floor(Math.random() * 1000);
  socket.on("setUsername", (username) => {
    usernames[socket.id] = username;
    io.sockets.emit("usernames", usernames);
  });

  // Make sure to send the client all existing peers
  socket.emit("introduction", peers);

  // tell other clients that a new peer joined
  io.emit("newPeerConnected", socket.id);

  peers[socket.id] = {
    position: [0, 0.5, 0],
    rotation: [0, 0, 0, 1], // stored as XYZW values of Quaternion
  };

  socket.on("msg", (data) => {
    console.log("Got message from client with id ", socket.id, ":", data);
    let messageWithId = { from: socket.id, data: data };
    socket.broadcast.emit("msg", messageWithId);
  });

  // whenever the client moves, update their movements in the clients object
  socket.on("move", (data) => {
    if (peers[socket.id]) {
      peers[socket.id].position = data[0];
      peers[socket.id].rotation = data[1];
    }
  });

  // Relay simple-peer signals back and forth
  socket.on("signal", (to, from, data) => {
    if (to in peers) {
      io.to(to).emit("signal", to, from, data);
    } else {
      console.log("Peer not found!");
    }
  });
  //generate URL
  socket.on("generateURL", async (prompt) => {
    try {
      const url = await generateURL(prompt);
      io.socket.emit("generatedURL", url);
    } catch (error) {
      console.error("Error generating URL:", error);
      io.socket.emit("generatedURL", null);
    }
  });

  socket.on("disconnect", () => {
    console.log("Someone with ID", socket.id, "left the server");

    io.sockets.emit("peerDisconnected", socket.id);

    delete peers[socket.id];
    delete usernames[socket.id];
    io.sockets.emit("usernames", usernames);
  });
});

// update all clients with peer data every 100 milliseconds (around 10 times per second)
setInterval(() => {
  io.sockets.emit("peers", peers);
  io.sockets.emit("usernames", usernames);
}, 100);
