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
    disconnectButton.addEventListener("click", () => {
        peerConnections.close();
    });
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
    document.getElementById("controls-container").style =
        "display: flex; gap: 30px; position: absolute; bottom: 0; left: 50%; margin-bottom: 20px; transform: translateX(-50%)";
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

    // Bật hoặc tắt hình ảnh
    function toggleVideo() {
        const videoTracks = stream.getVideoTracks();
        videoTracks.forEach((track) => {
            track.enabled = !track.enabled; // Đảo ngược trạng thái bật/tắt
        });
    }

    // Bật tắt âm thanh
    function toggleAudio() {
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach((track) => {
            track.enabled = !track.enabled;
        });
    }

    // Hiển thị trạng thái hình ảnh trong giao diện người dùng
    function updateVideoStatus() {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.every((track) => !track.enabled)) {
            document.getElementById(
                "toggle-video-button"
            ).innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-video-off" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M3 3l18 18"></path>
                                <path d="M15 11v-1l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -.675 .946"></path>
                                <path d="M10 6h3a2 2 0 0 1 2 2v3m0 4v1a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2h1"></path>
                            </svg>`;
        } else {
            document.getElementById(
                "toggle-video-button"
            ).innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-video" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z"></path>
                                <path d="M3 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z"></path>
                            </svg>`;
        }
    }

    // Hiển thị trạng thái hình ảnh trong giao diện người dùng
    function updateAudioStatus() {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.every((track) => !track.enabled)) {
            // videoStatus.textContent = "Hình ảnh đã tắt";
            document.getElementById(
                "toggle-audio-button"
            ).innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-microphone-off" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M3 3l18 18"></path>
                                <path d="M9 5a3 3 0 0 1 6 0v5a3 3 0 0 1 -.13 .874m-2 2a3 3 0 0 1 -3.87 -2.872v-1"></path>
                                <path d="M5 10a7 7 0 0 0 10.846 5.85m2 -2a6.967 6.967 0 0 0 1.152 -3.85"></path>
                                <path d="M8 21l8 0"></path>
                                <path d="M12 17l0 4"></path>
                            </svg>`;
        } else {
            document.getElementById(
                "toggle-audio-button"
            ).innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-microphone" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z"></path>
                                <path d="M5 10a7 7 0 0 0 14 0"></path>
                                <path d="M8 21l8 0"></path>
                                <path d="M12 17l0 4"></path>
                            </svg>`;
        }
    }

    // Khi người dùng nhấp vào nút/tắt hình ảnh
    const toggleVideoButton = document.getElementById("toggle-video-button");
    toggleVideoButton.addEventListener("click", () => {
        toggleVideo();
        updateVideoStatus();
    });

    // Khi người dùng nhấp vào nút/tắt âm thanh
    const toggleAudioButton = document.getElementById("toggle-audio-button");
    toggleAudioButton.addEventListener("click", () => {
        toggleAudio();
        updateAudioStatus();
    });
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
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-info-circle-filled" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 2c5.523 0 10 4.477 10 10a10 10 0 0 1 -19.995 .324l-.005 -.324l.004 -.28c.148 -5.393 4.566 -9.72 9.996 -9.72zm0 9h-1l-.117 .007a1 1 0 0 0 0 1.986l.117 .007v3l.007 .117a1 1 0 0 0 .876 .876l.117 .007h1l.117 -.007a1 1 0 0 0 .876 -.876l.007 -.117l-.007 -.117a1 1 0 0 0 -.764 -.857l-.112 -.02l-.117 -.006v-3l-.007 -.117a1 1 0 0 0 -.876 -.876l-.117 -.007zm.01 -3l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007z" stroke-width="0" fill="currentColor"></path>
                        </svg>
                    </div>
                    <div class="toast__body">
                        <h3 class="toast__title">${title}</h3>
                    </div>
                    <div class="toast__close">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-x" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M18 6l-12 12"></path>
                            <path d="M6 6l12 12"></path>
                        </svg>
                    </div>
                `;
        main.appendChild(toast);
    }
}

function showErrorToast() {
    toast({
        title: `Ngắt kết nối`,
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
