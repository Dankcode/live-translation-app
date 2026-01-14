import { Server } from 'socket.io';

export default function SocketHandler(req, res) {
    if (res.socket.server.io) {
        console.log('Socket is already running');
    } else {
        console.log('Socket is initializing');
        const io = new Server(res.socket.server);
        res.socket.server.io = io;

        io.on('connection', (socket) => {
            socket.on('send-subtitle', (data) => {
                socket.broadcast.emit('receive-subtitle', data);
            });
        });
    }
    res.end();
}
