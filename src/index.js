const app = require("./app")
const dotenv = require('dotenv');

dotenv.config();
console.log(process.env.GENIUS_API)
const port = process.env.PORT || 3000;

const WebSocket = require('ws');
const handleConnection = require('./server');

let WSServer = WebSocket.Server;
let server = require('http').createServer();

let wss = new WSServer({ server })

server.on('request', app);

wss.on('connection', handleConnection);

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
