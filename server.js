const path = require("path");
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

app.use("/", express.static(path.join(__dirname, "public")));

const userMap = {};

io.on("connection", (socket) => {
    console.log(`User connected`);
    socket.on("join", (payload) => {
        const roomId = payload.room;
        const roomClients = io.sockets.adapter.rooms[roomId] || { length: 0 };
        const numberOfClients = roomClients.length;
        const userName = payload.userName;
        console.log(`Room ID: ${roomId}`);
        console.log(`roomClients: ${roomClients}`);
        console.log(`numberOfClients of ${roomId}: ${numberOfClients}`);

        userMap[socket.id] = {
            userName: userName,
            roomId: roomId,
        };

        // These events are emitted only to the sender socket.
        if (numberOfClients == 0) {
            console.log(
                `Creating room ${roomId} and emitting room_created socket event`
            );
            socket.join(roomId);
            socket.emit("room_created", {
                roomId: roomId,
                peerId: socket.id,
                userName: userName,
            });
        } else {
            console.log(
                `Joining room ${roomId} and emitting room_joined socket event`
            );
            socket.join(roomId);
            socket.emit("room_joined", {
                roomId: roomId,
                peerId: socket.id,
                userName: userName,
            });
        }
    });

    // These events are emitted to all the sockets connected to the same room except the sender.
    socket.on("start_call", (event) => {
        console.log(
            `Broadcasting start_call event to peers in room ${event.roomId} from peer ${event.senderId}`
        );

        const senderId = event.senderId;

        const senderUser = userMap[senderId];

        if (senderUser) {
            socket.broadcast.to(event.roomId).emit("start_call", {
                senderId: event.senderId,
                userName: senderUser.userName,
            });
        }
    });

    //Events emitted to only one peer
    socket.on("webrtc_offer", (event) => {
        console.log(
            `Sending webrtc_offer event to peers in room ${event.roomId} from peer ${event.senderId} to peer ${event.receiverId}`
        );

        const senderId = event.senderId;
        const receiverId = event.receiverId;

        // Lấy thông tin người dùng từ userMap
        const senderUser = userMap[senderId];

        if (senderUser) {
            socket.broadcast.to(receiverId).emit("webrtc_offer", {
                sdp: event.sdp,
                senderId: event.senderId,
                userName: senderUser.userName,
            });
        }
    });

    socket.on("webrtc_answer", (event) => {
        console.log(
            `Sending webrtc_answer event to peers in room ${event.roomId} from peer ${event.senderId} to peer ${event.receiverId}`
        );
        socket.broadcast.to(event.receiverId).emit("webrtc_answer", {
            sdp: event.sdp,
            senderId: event.senderId,
        });
    });

    socket.on("webrtc_ice_candidate", (event) => {
        console.log(
            `Sending webrtc_ice_candidate event to peers in room ${event.roomId} from peer ${event.senderId} to peer ${event.receiverId}`
        );
        socket.broadcast
            .to(event.receiverId)
            .emit("webrtc_ice_candidate", event);
    });
});

// START THE SERVER =================================================================
const port = process.env.PORT || 4444;
server.listen(port, () => {
    console.log(`Express server listening on http://192.168.43.19:${port}`);
});
