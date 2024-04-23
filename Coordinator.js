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

const flaskSockets = [
    socketIoClient.connect('http://localhost:5001'),
    socketIoClient.connect('http://localhost:5002'),
    socketIoClient.connect('http://localhost:5003')
];


// Lista para almacenar las diferencias de tiempo recibidas del nodo Flask
const timeDifferences = [];

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
        flaskSocket1.emit('log_message', `[${getCurrentTime()}] Cliente ${origin} desconectado.`);
        
        // Elimina el nodo del mapa
        nodeSocketMap.delete(origin);
    });
});


const nodes = ['http://localhost:5001', 'http://localhost:5002', 'http://localhost:5003'];

function pingNode(nodeUrl) {
    const socket = socketIoClient.connect(nodeUrl);

    socket.on('connect', () => {
        console.log(`[${getCurrentTime()}] Ping a ${nodeUrl}: Conectado`);
        socket.emit('log_message', `[${getCurrentTime()}] Ping a ${nodeUrl}: Conectado`);
    });

    socket.on('connect_error', (error) => {
        console.log(`[${getCurrentTime()}] Ping a ${nodeUrl}: Error de conexión - ${error.message}`);
        socket.emit('log_message', `[${getCurrentTime()}] Ping a ${nodeUrl}: Error de conexión - ${error.message}`);
    });
}


nodes.forEach((nodeUrl) => {
    pingNode(nodeUrl);
    setInterval(() => {
        pingNode(nodeUrl);
    }, 20000); // 5000 milisegundos = 5 segundos
});

// implementación berkeley

// Función para obtener la hora actual del sistema en formato adecuado
function getCurrentTime() {
    const now = new Date();
    return now.toLocaleString();
}

function getCurrentTimeHour() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0'); // Asegura que siempre haya dos dígitos para las horas
    const minutes = now.getMinutes().toString().padStart(2, '0'); // Asegura que siempre haya dos dígitos para los minutos
    const seconds = now.getSeconds().toString().padStart(2, '0'); // Asegura que siempre haya dos dígitos para los segundos
    return `${hours}:${minutes}:${seconds}`;
}

// Función para enviar la hora del sistema a los nodos Flask
function sendSystemTimeToNodes() {
    const systemTime = getCurrentTimeHour();
    console.log(`[${getCurrentTimeHour()}] Enviando hora del sistema a los nodos Flask.`);
    flaskSockets.forEach((flaskSocket, index) => {
        flaskSocket.emit('coordinator_time', systemTime);
        console.log(`[${getCurrentTimeHour()}] Hora del sistema enviada al nodo ${index + 1}: ${systemTime}`);
    });
}


// Escuchar la diferencia de tiempo enviada desde el nodo Flask
// Escuchar la diferencia de tiempo enviada desde los nodos Flask
flaskSockets.forEach((flaskSocket, index) => {
    flaskSocket.on('time_difference', (data) => {
        const differenceSeconds = data.difference;
        console.log(`Diferencia de tiempo recibida desde Flask ${index + 1}: ${differenceSeconds} segundos`);
        
        // Almacenar la diferencia de tiempo en la lista
        timeDifferences.push(differenceSeconds);
        console.log('Lista de diferencias de tiempo:', timeDifferences);
    });
});


app.post('/start-berkeley', (req, res) => {
    sendSystemTimeToNodes();
    res.send('Algoritmo de Berkeley iniciado correctamente.');
});



// Escuchar en el puerto definido por el entorno o por defecto a 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de WebSocket escuchando en el puerto ${PORT}`);
});
