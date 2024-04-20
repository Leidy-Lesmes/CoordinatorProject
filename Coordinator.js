const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const socketIoClient = require('socket.io-client'); // Importar socket.io-client para el cliente

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' })); // Puedes cambiar '*' para especificar orígenes permitidos

const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true
    }
});

io.on('connection', (socket) => {
    console.log('Nuevo cliente conectado');

    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
        // Realizar alguna acción cuando un cliente se desconecte, si es necesario
    });
});

const nodes = ['http://localhost:5001', 'http://localhost:5002', 'http://localhost:5003'];

function pingNode(nodeUrl) {
    const socket = socketIoClient.connect(nodeUrl);

    socket.on('connect', () => {
        console.log(`Ping a ${nodeUrl}: Conectado`);

    });

    socket.on('connect_error', (error) => {
        console.log(`Ping a ${nodeUrl}: Error de conexión - ${error.message}`);

    });
}

nodes.forEach((nodeUrl) => {
    pingNode(nodeUrl);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de WebSocket escuchando en el puerto ${PORT}`);
});
