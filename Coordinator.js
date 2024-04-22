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


// Mapa para guardar la relación entre nodo y socket ID
const nodeSocketMap = new Map();

// Evento de conexión
io.on('connection', (socket) => {
    const origin = socket.handshake.headers.origin;
    
    console.log(`[${getCurrentTime()}] Nuevo cliente conectado desde: ${origin}`);

    // Guarda el socket en el mapa de nodos
    nodeSocketMap.set(origin, socket.id);

    // Envía el mensaje al nodo específico
    socket.emit('log_message', `[${getCurrentTime()}] Conexión exitosa de ${origin} al server ws.`);

    socket.on('disconnect', () => {
        console.log(`[${getCurrentTime()}] Cliente ${origin} desconectado.`);
        flaskSocket.emit('log_message', `[${getCurrentTime()}] Cliente ${origin} desconectado.`);
        
        // Elimina el nodo del mapa
        nodeSocketMap.delete(origin);
    });
});


const nodes = ['http://localhost:5001', 'http://localhost:5002'];

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


// Función para obtener la hora actual
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


// Escuchar en el puerto definido por el entorno o por defecto a 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de WebSocket escuchando en el puerto ${PORT}`);
});
