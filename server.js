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
    // 第一步:根据对话总结用户的兴趣
    const interestResult = await model.generateContent(
      `Based on the following dialogue:\n${prompt}\nPlease summarize what kind of website topic/real world location/video topic the user might be interested in, in one sentence.`,
      generationConfig
    );
    const interestResponse = await interestResult.response;
    const interest = interestResponse.text();
    console.log("Inferred user interest:", interest);

    // 第二步:根据用户的兴趣搜索相关的视频或Google地点的URL
    const urlResult = await model.generateContent(
      `Please search on the internet. You are a URL generator. Based on the following user interest:\n${interest}\nPlease generate a related video or Google Maps location URL that the user might be interested in visiting.`,
      generationConfig
    );
    const urlResponse = await urlResult.response;
    const url = urlResponse.text();
    console.log("Generated URL:", url);
    return url;
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
    const url = await generateURL(prompt);
    socket.emit("generatedURL", url);
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
