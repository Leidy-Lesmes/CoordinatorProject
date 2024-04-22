const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const socketIoClient = require('socket.io-client');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));

const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true
    }
});

// Configuración del socket para comunicarse con el servidor Flask
const flaskSocket = socketIoClient.connect('http://localhost:5001');

// Eventos importantes en el nodo coordinador
io.on('connection', (socket) => {
    console.log(`[${getCurrentTime()}] Nuevo cliente conectado desde: ${socket.handshake.headers.origin}`);
    flaskSocket.emit('log_message', `[${getCurrentTime()}] Nuevo cliente conectado desde: ${socket.handshake.headers.origin}`);

    socket.on('disconnect', () => {
        console.log(`[${getCurrentTime()}] Cliente desconectado desde: ${socket.handshake.headers.origin}`);
        flaskSocket.emit('log_message', `[${getCurrentTime()}] Cliente desconectado desde: ${socket.handshake.headers.origin}`);
    });
});

const nodes = ['http://localhost:5001'];

function pingNode(nodeUrl) {
    const socket = socketIoClient.connect(nodeUrl);

    socket.on('connect', () => {
        console.log(`[${getCurrentTime()}] Ping a ${nodeUrl}: Conectado`);
        flaskSocket.emit('log_message', `[${getCurrentTime()}] Ping a ${nodeUrl}: Conectado`);
    });

    socket.on('connect_error', (error) => {
        console.log(`[${getCurrentTime()}] Ping a ${nodeUrl}: Error de conexión - ${error.message}`);
        flaskSocket.emit('log_message', `[${getCurrentTime()}] Ping a ${nodeUrl}: Error de conexión - ${error.message}`);
    });
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleString();
}

nodes.forEach((nodeUrl) => {
    pingNode(nodeUrl);
    setInterval(() => {
        pingNode(nodeUrl);
    }, 5000); // 5000 milisegundos = 5 segundos
});

// implementación berkeley

// Endpoint para enviar la hora del coordinador a los nodos y a sí mismo
app.get('/send-coordinator-time', (req, res) => {
    const currentTime = getCurrentTime();
    // Emitir la hora del coordinador a los nodos
    io.emit('coordinator_time', currentTime);
    // También enviar la hora del coordinador al servidor Flask
    flaskSocket.emit('coordinator_time', currentTime);
    res.send('Hora del coordinador enviada a los nodos y coordinador');
});

// endpoint para recibir la hora del coordinador
app.get('/receive-coordinator-time', (req, res) => {
    const currentTime = getCurrentTime();
    const receivedTime = req.query.time; // Hora recibida desde el coordinador Flask
    console.log(`Hora del coordinador recibida: ${receivedTime}`);
    const difference = calculateDifference(currentTime, receivedTime);
    console.log(`Diferencia entre la hora actual y la hora del coordinador: ${difference}`);
});

// Función para calcular la diferencia entre dos tiempos
function calculateDifference(currentTime, receivedTime) {
    const currentTimestamp = new Date(currentTime).getTime();
    const receivedTimestamp = new Date(receivedTime).getTime();
    const difference = currentTimestamp - receivedTimestamp;
    return difference;
}




const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de WebSocket escuchando en el puerto ${PORT}`);
});
