const roomSelectionContainer = document.getElementById(
    "room-selection-container"
);
const roomInput = document.getElementById("room-input");
const connectButton = document.getElementById("connect-button");
// const nameDisplayed = document.getElementById("display-name");
// const localChat = document.getElementById("local");
const disconnectButton = document.getElementById("disconnect-button");

const videoChatContainer = document.getElementById("video-chat-container");
const localVideoComponent = document.getElementById("local-video");
const guestComponent = document.getElementById("guest");

// Variables.
const socket = io();
const mediaConstraints = {
    audio: true,
    video: true,
};
const offerOptions = {
    offerToReceiveVideo: 1,
    offerToReceiveAudio: 1,
};

var peerConnections = {};

let localPeerId;
let localStream;
let rtcPeerConnection; // Connection between the local device and the remote peer.
let roomId;
// let displayName;

// connect to stun server
const iceServers = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
            urls: "turn:a.relay.metered.ca:443",
            username: "6b41afadc9eda2a87e649b7a",
            credential: "sRqbPILONoHRg0Vz",
        },
    ],
};

// BUTTON LISTENER ============================================================
connectButton.addEventListener("click", () => {
    joinRoom(roomInput.value);
});

// SOCKET EVENT CALLBACKS =====================================================

socket.on("room_created", async (event) => {
    localPeerId = event.peerId;
    console.log(`Current peer ID: ${localPeerId}`);
    console.log(
        `Socket event callback: room_created with by peer ${localPeerId}, created room ${event.roomId}`
    );
    // displayName = event.displayName;

    await setLocalStream(mediaConstraints);
});

socket.on("room_joined", async (event) => {
    localPeerId = event.peerId;
    console.log(`Current peer ID: ${localPeerId}`);
    console.log(
        `Socket event callback: room_joined by peer ${localPeerId}, joined room ${event.roomId}`
    );

    await setLocalStream(mediaConstraints);
    console.log(`Emit start_call from peer ${localPeerId}`);
    socket.emit("start_call", {
        roomId: event.roomId,
        senderId: localPeerId,
        // name: displayName,
    });
});

socket.on("start_call", async (event) => {
    const remotePeerId = event.senderId;
    console.log(
        `Socket event callback: start_call. RECEIVED from ${remotePeerId}`
    );

    peerConnections[remotePeerId] = new RTCPeerConnection(iceServers);
    addLocalTracks(peerConnections[remotePeerId]);
    peerConnections[remotePeerId].ontrack = (event) =>
        setRemoteStream(event, remotePeerId);
    peerConnections[remotePeerId].oniceconnectionstatechange = (event) =>
        checkPeerDisconnect(event, remotePeerId);
    peerConnections[remotePeerId].onicecandidate = (event) =>
        sendIceCandidate(event, remotePeerId);
    await createOffer(peerConnections[remotePeerId], remotePeerId);
});

socket.on("webrtc_offer", async (event) => {
    console.log(
        `Socket event callback: webrtc_offer. RECEIVED from ${event.senderId}`
    );
    const remotePeerId = event.senderId;

    peerConnections[remotePeerId] = new RTCPeerConnection(iceServers);
    console.log(new RTCSessionDescription(event.sdp));
    peerConnections[remotePeerId].setRemoteDescription(
        new RTCSessionDescription(event.sdp)
    );
    console.log(
        `Remote description set on peer ${localPeerId} after offer received`
    );
    addLocalTracks(peerConnections[remotePeerId]);

    peerConnections[remotePeerId].ontrack = (event) =>
        setRemoteStream(event, remotePeerId);
    peerConnections[remotePeerId].oniceconnectionstatechange = (event) =>
        checkPeerDisconnect(event, remotePeerId);
    peerConnections[remotePeerId].onicecandidate = (event) =>
        sendIceCandidate(event, remotePeerId);
    await createAnswer(peerConnections[remotePeerId], remotePeerId);
});

socket.on("webrtc_answer", async (event) => {
    console.log(
        `Socket event callback: webrtc_answer. RECEIVED from ${event.senderId}`
    );

    console.log(
        `Remote description set on peer ${localPeerId} after answer received`
    );
    peerConnections[event.senderId].setRemoteDescription(
        new RTCSessionDescription(event.sdp)
    );
    //addLocalTracks(peerConnections[event.senderId])
    console.log(new RTCSessionDescription(event.sdp));
});

socket.on("webrtc_ice_candidate", (event) => {
    const senderPeerId = event.senderId;
    console.log(
        `Socket event callback: webrtc_ice_candidate. RECEIVED from ${senderPeerId}`
    );

    // ICE candidate configuration.
    var candidate = new RTCIceCandidate({
        sdpMLineIndex: event.label,
        candidate: event.candidate,
    });
    peerConnections[senderPeerId].addIceCandidate(candidate);
});

// FUNCTIONS ==================================================================

function joinRoom(room) {
    if (room === "") {
        alert("Please type a room ID");
    } else {
        roomId = room;
        // displayName = displayName;
        socket.emit("join", {
            room: room,
            peerUUID: localPeerId,
            // displayName: displayName,
        });
        showVideoConference();
    }
}

function showVideoConference() {
    roomSelectionContainer.style = "display: none";
    document.getElementsByTagName("BODY")[0].style = "background-color: #eee";
    videoChatContainer.style = "display: block";
    // const localName = document.createElement("label");

    // localName.innerText = displayName;
    // localChat.appendChild(localName);
}

async function setLocalStream(mediaConstraints) {
    console.log("Local stream set");
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    } catch (error) {
        console.error("Could not get user media", error);
    }

    localStream = stream;
    localVideoComponent.srcObject = stream;
    localVideoComponent.style = "box-shadow: rgb(4 4 4 / 94%) 0px 7px 29px 0px";
}

function addLocalTracks(rtcPeerConnection) {
    localStream.getTracks().forEach((track) => {
        rtcPeerConnection.addTrack(track, localStream);
    });
    console.log("Local tracks added");
}

async function createOffer(rtcPeerConnection, remotePeerId) {
    let sessionDescription;
    try {
        sessionDescription = await rtcPeerConnection.createOffer(offerOptions);
        rtcPeerConnection.setLocalDescription(sessionDescription);
    } catch (error) {
        console.error(error);
    }

    console.log(
        `Sending offer from peer ${localPeerId} to peer ${remotePeerId}`
    );
    socket.emit("webrtc_offer", {
        type: "webrtc_offer",
        sdp: sessionDescription,
        roomId: roomId,
        senderId: localPeerId,
        receiverId: remotePeerId,
    });
}

async function createAnswer(rtcPeerConnection, remotePeerId) {
    let sessionDescription;
    try {
        sessionDescription = await rtcPeerConnection.createAnswer(offerOptions);
        rtcPeerConnection.setLocalDescription(sessionDescription);
    } catch (error) {
        console.error(error);
    }

    console.log(
        `Sending answer from peer ${localPeerId} to peer ${remotePeerId}`
    );
    socket.emit("webrtc_answer", {
        type: "webrtc_answer",
        sdp: sessionDescription,
        roomId: roomId,
        senderId: localPeerId,
        receiverId: remotePeerId,
    });
}

function setRemoteStream(event, remotePeerId) {
    console.log("Remote stream set");
    if (event.track.kind == "video") {
        const videoREMOTO = document.createElement("video");
        videoREMOTO.srcObject = event.streams[0];
        videoREMOTO.id = "remotevideo_" + remotePeerId;
        videoREMOTO.setAttribute("autoplay", "");
        videoREMOTO.style = "box-shadow: rgb(4 4 4 / 94%) 0px 7px 29px 0px";
        guestComponent.append(videoREMOTO);
    }
}

function sendIceCandidate(event, remotePeerId) {
    if (event.candidate) {
        console.log(
            `Sending ICE Candidate from peer ${localPeerId} to peer ${remotePeerId}`
        );
        socket.emit("webrtc_ice_candidate", {
            senderId: localPeerId,
            receiverId: remotePeerId,
            roomId: roomId,
            label: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate,
        });
    }
}

function toast({ title = "", type = "info", duration = 3000 }) {
    const main = document.getElementById("toast");
    if (main) {
        const toast = document.createElement("div");

        // Auto remove toast
        const autoRemoveId = setTimeout(function () {
            main.removeChild(toast);
        }, duration + 1000);

        // Remove toast when clicked
        toast.onclick = function (e) {
            if (e.target.closest(".toast__close")) {
                main.removeChild(toast);
                clearTimeout(autoRemoveId);
            }
        };

        const delay = (duration / 1000).toFixed(2);

        toast.classList.add("toast", `toast--${type}`);
        toast.style.animation = `slideInLeft ease .3s, fadeOut linear 1s ${delay}s forwards`;

        toast.innerHTML = `
                    <div class="toast__icon">
                        <i class="fa-solid fa-circle-info"></i>
                    </div>
                    <div class="toast__body">
                        <h3 class="toast__title">${title}</h3>
                    </div>
                    <div class="toast__close">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                `;
        main.appendChild(toast);
    }
}

function showErrorToast() {
    toast({
        title: `Người dùng đã ngắt kết nối`,
        type: "info",
        duration: 5000,
    });
}

function checkPeerDisconnect(event, remotePeerId) {
    var state = peerConnections[remotePeerId].iceConnectionState;
    console.log(`connection with peer ${remotePeerId}: ${state}`);
    if (state === "failed" || state === "closed" || state === "disconnected") {
        showErrorToast();
        console.log(`Peer ${remotePeerId} has disconnected`);
        const videoDisconnected = document.getElementById(
            "remotevideo_" + remotePeerId
        );
        videoDisconnected.remove();
    }
}
