const loadingCard = document.querySelector(".loading-card");
const nameInput = document.getElementById("name");
const submitName = document.getElementById("submit-name");
let username = localStorage.getItem("username");

const createGame = document.getElementById("create");
const joinGame = document.getElementById("join");

const newSection = document.querySelector(".new");
const playSection = document.querySelector(".play");

const createSection = document.querySelector(".create");
const joinSection = document.querySelector(".join");

const joinCode = document.getElementById("code");
const joinSubmit = document.getElementById("submit-code");
const joinStatus = document.getElementById("join-status");

const gameSection = document.querySelector(".game");
const waitingSection = document.querySelector(".waiting");

const musicQuery = document.getElementById("music-query");
const musicList = document.querySelector(".music-list");

const musicFinderTitle = document.getElementById("music-finder-title");
const musicFinder = document.querySelector(".music-finder");
const playersStatus = document.querySelector(".players-status");

const playersDone = document.querySelector(".players-done");
const playersChoosing = document.querySelector(".players-choosing");

const musicPlayer = document.querySelector(".music-player");
const questionText = document.querySelector(".question-text");
const questionThumbnail = document.querySelector(".question-thumbnail");
const answerQuestion = document.getElementById("answer-question");
const scoreViewer = document.querySelector(".score-viewer");
const scores = document.querySelector(".scores");

const isLocalhost = window.location.host.indexOf("localhost") == 0;
const protocol = isLocalhost ? "ws://" : "wss://";

let lastMusicQuery = null;
let lastQueryString = null;

let audio = null;

let isHost = false;

const QUERY_API = "https://genius.worker.jooo.tech/?q=";

let state = "initial";
let socketState = "initial";

let roomData = {
    code: null,
    players: [],
}

const socket = new WebSocket(protocol + window.location.host);

socket.onclose = () => {
    location.reload();
}

socket.onopen = () => {
    console.log("connected");


    socket.onmessage = async (event) => {
        console.log(event.data);
        const { action, payload } = JSON.parse(event.data);

        switch (socketState) {
            case "initial":
                if (action === "emoji") {
                    console.log(payload)
                    username += " " + payload;
                }
                break;
            case "joiningCode":
                if (action === "code") {
                    roomData.code = payload;
                    roomData.players.push(username);
                    socketState = "waitingForStart";
                    showPage(state = "waiting");
                } else if (action === "error") {
                    joinStatus.innerText = payload;
                }
                break;
            case "waitingForCode":

                if (action === "code") {
                    roomData.code = payload;
                    roomData.isHost = true;
                    roomData.players.push(username);

                    socketState = "waitingForStart";

                    showPage(state = "waiting");
                }
                break;
            case "waitingForGame":
                if (action == "submissions") {
                    const submissions = roomData.submissions = JSON.parse(payload);
                    const playersNotDone = roomData.players.filter(player => !submissions.includes(player));

                    playersChoosing.innerHTML = (playersNotDone.length == 0 ? "No one" :
                        playersNotDone
                            .map(player => `<b class="player choosing">${player}</b>`).join("")
                    );

                    playersDone.innerHTML = submissions.map(player => `<b class="player done">${player}</b>`).join("");
                } else if (action == "start_game") {
                    socketState = "waitingForQuestion";
                    socket.send(JSON.stringify({ action: "get_question" }));

                    await hideElm(playersStatus);
                    showElm(musicPlayer);
                }
                break;
            case "waitingForStart":
                if (action == "players") {
                    const playersDiv = document.querySelector(".players");
                    roomData.players = payload;

                    playersDiv.innerHTML = payload.map(player => `<b class="player">${player}</b>`).join("");
                }

                if (action == "start") {
                    musicFinderTitle.innerText = "Choose a song for the game";

                    showPage(state = "play");
                    socketState = "playing";

                    musicList.innerHTML = "Please type something";
                    musicQuery.value = "";
                    musicQuery.focus();
                }
                break;
            case "waitingForQuestion":
                if (action == "question") {
                    const { preview } = payload;

                    audio = new Audio(preview);
                    audio.volume = 0;
                    audio.play();

                    for (let i = 0; i < 10; i++) {
                        audio.volume += 0.05;
                        await sleep(50);
                    }

                    answerQuestion.onclick = async () => {
                        answerQuestion.onclick = null;

                        (async () => {
                            for (let i = 0; i < 10; i++) {
                                audio.volume -= 0.05;
                                await sleep(50);
                            }

                            audio.pause();
                        })();

                        socketState = "waitingForAnswer";

                        musicQuery.value = "";

                        musicFinderTitle.innerText = "Choose the song you just heard";

                        await hideElm(musicPlayer);
                        showElm(musicFinder);

                        musicQuery.focus();
                        musicList.innerHTML = "Please Wait...";
                    }
                }
                break;
            case "waitingForScore":
                if (action == "score") {
                    const { total, round } = payload;

                    const totalScores = Object.entries(total).map(([player, score]) => ({ player, score }));

                    scores.innerHTML = "";

                    for (const { player, score } of totalScores) {
                        const roundScore = round[player];
                        const template = `
                        <div class="player-score-item">
                            <b class="player-name">${player} /</b>
                            <b class="player-total-score">${score - roundScore}</b>
                            +
                            <b class="player-score">${roundScore}</b>
                        </div>
                        `

                        scores.innerHTML += template;
                    }

                    if (isHost) {
                        const nextButton = document.createElement("button");
                        nextButton.innerText = "Next Challenge";
                        nextButton.classList.add("button");

                        nextButton.onclick = () => {
                            socket.send(JSON.stringify({ action: "next_challenge" }));
                        }

                        scores.appendChild(nextButton);
                    }
                }

                if (action == "ready") {
                    socketState = "waitingForQuestion";
                    socket.send(JSON.stringify({ action: "get_question" }));

                    await hideElm(scoreViewer);
                    showElm(musicPlayer);
                }

                if (action == "next_round") {
                    musicFinderTitle.innerText = "Choose a song for the game";

                    await hideElm(scoreViewer);
                    showElm(musicFinder);
                    
                    socketState = "playing";

                    musicList.innerHTML = "Please type something";
                    musicQuery.value = "";
                    musicQuery.focus();
                }
                    
                break;
        }
    }
}

async function startSocket() {
    if (typeof fp == "undefined") {
        await sleep(100);
        startSocket();
    }

    try {
        socket.send(JSON.stringify({
            username,
            fp
        }));
    } catch (e) {
        location.reload();
    }
}

function joinRoom() {
    const code = joinCode.value;

    if (code.length == 4 && !isNaN(code)) {
        socketState = "joiningCode";
        socket.send(JSON.stringify({ action: "join", payload: code }));
    }
}

function startRoom() {
    socket.send(JSON.stringify({ action: "start" }));
}

musicQuery.addEventListener("keydown", async (e) => {
    const value = musicQuery.value;

    if (value == lastQueryString || value.length < 1) return;

    lastQueryString = value;

    musicList.innerHTML = "Please Wait...";

    if (lastMusicQuery) clearTimeout(lastMusicQuery);

    const res = fetch(QUERY_API + value, {
        method: "POST"
    });

    lastMusicQuery = setTimeout(async (res) => {
        res = await Promise.resolve(res);
        console.log(res);

        if (value.length == 0) return musicList.innerHTML = "Please type something";

        const { data } = await res.json();

        musicList.replaceChildren();

        musicFinderTitle.innerText = "Choose a song for the game";

        for (const item of data) {
            const { id, title, artist_names, thumbnail_url } = item;

            const div = document.createElement("div");

            div.classList.add("music-item");

            div.onclick = async () => {
                if (socketState == "playing") {
                    socketState = "waitingForGame";

                    await hideElm(musicFinder);
                    await showElm(playersStatus);

                    socket.send(JSON.stringify({ action: "submit_music", payload: item }));
                } else {
                    socketState = "waitingForScore";
                    socket.send(JSON.stringify({ action: "submit_answer", payload: item }));

                    await hideElm(musicFinder);
                    await showElm(scoreViewer);

                }
            };

            div.innerHTML = `
            <img class="music-thumb" src="${thumbnail_url}" alt="${title} - ${artist_names}">
            <div class="music-info">
                <h3>${title}</h3>
                <p>${artist_names}</p>
            </div>
        `;

            musicList.appendChild(div);

            await sleep(50);
        }
    }, 500, res);
});

createGame.addEventListener("click", () => {
    showPage(state = "create");
});

joinGame.addEventListener("click", () => {
    showPage(state = "join");
    joinCode.focus();
});

code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        joinSubmit.click();
    }
});

joinSubmit.addEventListener("click", () => {
    if (joinCode.value.length == 4 && !isNaN(joinCode.value)) {
        localStorage.setItem("code", joinCode.value);
        joinRoom();
    } else {
        joinStatus.innerText = joinCode.value.length != 4 ? "Code Too Short" : "Only Numbers Allowed";
    }
});

submitName.addEventListener("click", () => {
    if (nameInput.value !== "") {
        localStorage.setItem("username", nameInput.value);
        username = localStorage.getItem("username");
        showPage();
    }
});

nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        submitName.click();
    }
});

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function showElm(elm) {
    elm.classList.add("slide-in");
    elm.classList.remove("slide-out");
    await sleep(50);
    elm.classList.remove("hidden");
}

async function hideElm(elm) {
    elm.classList.add("slide-out");
    await sleep(450);
    elm.classList.add("hidden");
    elm.classList.remove("slide-in");
}

async function removeElm(elm) {
    elm.classList.add("slide-out");
    await sleep(450);
    elm.remove();
}

async function showPage() {
    switch (state) {
        case "initial":
            if (username == null) {
                showElm(newSection)
            } else {
                await removeElm(newSection);
                showElm(playSection)
                startSocket();
            }
            break;
        case "create":
            createSection.innerHTML = `
                <h1>Creating Room...</h1>
            `;
            await removeElm(playSection);
            socketState = "waitingForCode"
            socket.send(JSON.stringify({ "action": "create" }));
            isHost = true;
            showElm(createSection);
            break;
        case "join":
            await removeElm(playSection);
            showElm(joinSection);
            break;
        case "waiting":
            let promises = [removeElm(createSection), removeElm(joinSection)];
            console.log(promises)
            await Promise.all(promises);
            showElm(waitingSection);

            if (roomData.isHost) {
                waitingSection.innerHTML = `
                    <h1>Code: ${roomData.code}</h1>
                    <h2>Players</h2>
                    <div class="players">
                        ${roomData.players.map(player => `<b class="player">${player}</b>`)}
                    </div>
                    <button onclick="startRoom()" class="button">Start</button>
                `;
            } else {
                waitingSection.innerHTML = `
                    <h1>Waiting for Host</h1>
                    <h2>Code: ${roomData.code}</h2>
                    <div class="players">
                        ${roomData.players.map(player => `<b class="player">${player}</b>`)}
                    </div>
                `;
            }
            break;
        case "play":
            musicQuery.value = "";
            await removeElm(waitingSection);
            showElm(gameSection);
            musicQuery.focus();
            break;
    }
}

// remove loading screen
window.addEventListener('load', () => {
    loadingCard.classList.add("slide-out");
    setTimeout(function () {
        loadingCard.remove();
    }, 750);
});

showPage();