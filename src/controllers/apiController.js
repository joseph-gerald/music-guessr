const path = require('path');

exports.ping = (req, res) => {
    res.send('pong');
};

exports.getRobots = async (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'robot/robots.txt'));
};

exports.getRobotsMinified = async (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'robot/robots.min.txt'));
};