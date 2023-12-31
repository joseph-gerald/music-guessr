const e = require("express");

let clients = [];
let players = [];
let rooms = [];

const emojis = [..."😷🤒🤕🤢🤮🤧😢😭😨🤯🥵🥶🤑😴🥰🤣🤡💀👽👾🤖👶💋❤️💔💙💚💛🧡💜🖤💤💢💣💥💦💨💫👓💍💎👑🎓🧢💄💍💎🐵🦒🐘🐀🍆🍑🍒🍓⚽🎯🔊🔇🔋🔌💻💰💯"];

function getEmojiIndex(string) {
    const index = string.split("").map(x => x.charCodeAt()).reduce((a, b) => a + b);
    return index % emojis.length;
}

function broadcastTo(players, data) {
    players.forEach(player => {
        player.client.send(JSON.stringify(data));
    });
}

class Player {
    constructor(name, fp, ip, client) {
        this.emojiIndex = getEmojiIndex(fp.hash);
        this.emoji = emojis[this.emojiIndex];

        this.name = name + " " + this.emoji;
        this.client = client;
        this.fp = fp;

        this.room = null;
        this.ip = ip;

        this.fpHash = fp.hash;
        this.fpData = fp.data;
    }
}

class Round {
    constructor(room) {
        this.room = room;
        this.submissions = [];
        this.answers = [];
        this.scores = {};
        this.first_timestamp = -1;
    }

    submitAnswer(player, answer) {
        const correct = this.submissions[this.room.questionIndex].payload;
        const wasRight = correct.preview == answer.preview;
        const timestamp = Date.now();
        if (this.first_timestamp == -1) this.first_timestamp = timestamp;
        const score = wasRight ? 1100 - Math.max(Math.round((timestamp - this.first_timestamp) * 0.05),100) : 0;

        this.answers.push({ player, answer, correct, timestamp, score });

        return score;
    }
}

class Room {
    constructor(host) {
        this.code = Math.floor(Math.random() * 9000) + 1000;
        this.players = [host];
        this.scores = {};
        this.state = "waiting";
        this.host = host;
        this.rounds = [];
    }

    addPlayer(player) {
        this.players.push(player);
        this.broadcastToRoom({ action: "players", payload: this.players.map(x => x.name) });
    }

    removePlayer(player) {
        const position = this.players.indexOf(player);
        this.players.splice(position, 1);
        this.broadcastToRoom({ action: "players", payload: this.players.map(x => x.name) });
    }

    broadcastToRoom(data) {
        broadcastTo(this.players, data);
    }
}

function createRoom(host) {
    const room = new Room(host);

    if (rooms.includes(room)) return createRoom(host);

    rooms.push(room);
    return room;
}

function handleConnection(client, request) {
    const headers = request.headers;
    const ip = headers["cf-connecting-ip"] || request.connection.remoteAddress;
    let player = null;

    clients.push(client);
    players.push(player);

    function onClose() {
        var position = clients.indexOf(client);
        clients.splice(position, 1);
        console.log("connection closed");

        if (player && player.room) {
            player.room.removePlayer(player);
        }
    }

    function onMessage(data) {
        if (player == null) {
            try {
                const { username, fp } = JSON.parse(data);
                player = new Player(username, fp, ip, client)
                client.send(JSON.stringify({ action: "emoji", payload: player.emoji }));
            } catch (e) {
                client.close();
            }
            return;
        }

        if (data.indexOf("keepalive") == 0) {
            const count = data.split("/")[1];

            if (isNaN(parseInt(count))) throw Error("Invalid Keepalive");

            console.log("Count: " + count)

            return;
        }

        const parsed = JSON.parse(data);
        const { action, payload } = parsed;
        let round = null;

        if (action) {
            switch (action) {
                case "create":
                    const room = createRoom(player);
                    player.room = room;
                    rooms.push(room);
                    client.send(JSON.stringify({ action: "code", payload: room.code }));
                    break;
                case "join":
                    const roomToJoin = rooms.find(room => room.code == payload);

                    if (roomToJoin) {
                        if (roomToJoin.state != "waiting")
                            return client.send(JSON.stringify({ action: "error", payload: "Game already started" }));

                        player.room = roomToJoin;
                        roomToJoin.addPlayer(player);
                        client.send(JSON.stringify({ action: "code", payload: roomToJoin.code }));
                        client.send(JSON.stringify({ action: "players", payload: roomToJoin.players.map(x => x.name) }));
                    } else {
                        client.send(JSON.stringify({ action: "error", payload: "Room not found" }));
                    }
                    break;
                case "start":
                    if (player.room.host == player) {
                        player.room.broadcastToRoom({ action: "start" });
                        player.room.state = "playing";

                        player.room.rounds.push(new Round(player.room));
                    }
                    break;
                case "submit_music":
                    round = player.room.rounds[player.room.rounds.length - 1];

                    round.submissions.push({ player, payload });

                    player.room.broadcastToRoom({ action: "submissions", payload: JSON.stringify(round.submissions.map(x => x.player).map(player => player.name)) });

                    if (round.submissions.length == player.room.players.length && !round.started) {
                        player.room.broadcastToRoom({ action: "start_game" });
                        player.room.questionIndex = 0;
                        round.started = true;
                    }
                    break;
                case "get_question":
                    round = player.room.rounds[player.room.rounds.length - 1];

                    if (round.started) {
                        const question = round.submissions[round.room.questionIndex];

                        player.client.send(JSON.stringify({
                            action: "question",
                            payload: {
                                preview: question.payload.preview,
                            }
                        }));
                    }

                    player.room.scores[player.name] ??= 0;
                    round.scores[player.name] = -1;
                    break;
                case "submit_answer":
                    round = player.room.rounds[player.room.rounds.length - 1];
                    const score = round.submitAnswer(player, payload);

                    player.room.scores[player.name] ??= 0;
                    player.room.scores[player.name] += score;
                    round.scores[player.name] = score;

                    player.room.broadcastToRoom(
                        {
                            action: "score", payload: {
                                total: player.room.scores,
                                round: round.scores
                            }
                        }
                    );
                    break;
                case "next_challenge":
                    round = player.room.rounds[player.room.rounds.length - 1];
                    round.room.questionIndex++;

                    if (round.room.questionIndex >= round.submissions.length) {
                        round.room.questionIndex = 0;
                        round.room.rounds.push(new Round(round.room));
                        player.room.broadcastToRoom({ action: "next_round" });
                    } else {
                        round.first_timestamp = -1;
                        player.room.broadcastToRoom({ action: "ready" });
                    }
                    break;
            }
        }
    }

    client.on('message', data => {
        try {
            onMessage(data.toString())
        } catch (error) {
            client.close();
            console.log(error)
        }
    });
    client.on('close', onClose);
}

function broadcast(data) {
    for (c in clients) {
        clients[c].send(JSON.stringify(data));
    }
}

module.exports = handleConnection;