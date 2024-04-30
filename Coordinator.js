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

// Variable para almacenar el tiempo del coordinador
let coordinatorTime;
// Contador para realizar un seguimiento del número de diferencias de tiempo recibidas desde los nodos
let receivedTimeDifferenceCount = 0;
let nodeTimeDifferences = [];
// Mapa para guardar la relación entre nodo y socket ID
const nodeSocketMap = new Map();
// Objeto para almacenar las diferencias de tiempo recibidas de cada nodo activo
const nodeTimeDifferencesMap = new Map();

const nodes = ['http://localhost:5001', 'http://localhost:5002', 'http://localhost:5003'];

function getCurrentTime() {
    return new Date().toLocaleTimeString();
}

io.on('connection', (socket) => {
    const origin = socket.handshake.query.clientUrl;

    console.log(`[${getCurrentTime()}] Nuevo cliente conectado desde: ${origin}`);

    nodeSocketMap.set(origin, socket.id);

    socket.on('join_vue_clients', () => {
        socket.join('vue-clients');
        io.to('vue-clients').emit('system_log', `[${getCurrentTime()}] Client from Vue connected. ${origin}`);
    });

    socket.emit('log_message', `[${getCurrentTime()}] Connected successful from ${origin} to coordinator server.`);
    io.to('vue-clients').emit('system_log', `[${getCurrentTime()}] Connected successful from ${origin} to coordinator server.`);

    socket.on('disconnect', () => {
        console.log(`[${getCurrentTime()}] Client ${origin} disconnected.`);
        io.to('vue-clients').emit('system_log', `[${getCurrentTime()}] Client ${origin} disconnected.`);
        nodeSocketMap.delete(origin);
    });
});

function pingNode(nodeUrl) {
    const socket = socketIoClient.connect(nodeUrl);

    socket.on('connect', () => {
        console.log(`[${getCurrentTime()}] Ping a ${nodeUrl}: Functional network level connection`);
        io.emit('node_status', {
            timestamp: getCurrentTime(),
            ip: nodeUrl,
            isActive: true,
        });
        io.to('vue-clients').emit('system_log', `[${getCurrentTime()}] Ping a ${nodeUrl}: Functional network level connection`);
    });

    socket.on('connect_error', (error) => {
        console.log(`[${getCurrentTime()}] Ping a ${nodeUrl}: Error de conexión - ${error.message}`);
        io.emit('node_status', {
            timestamp: getCurrentTime(),
            ip: nodeUrl,
            isActive: false,
        });
        io.to('vue-clients').emit('system_log', `[${getCurrentTime()}] Ping a ${nodeUrl}: Error de conexión - ${error.message}`);
    });
}

nodes.forEach((nodeUrl) => {
    pingNode(nodeUrl);
    setInterval(() => {
        pingNode(nodeUrl);
    }, 10000);
});

// Implementación de Berkeley

function startCoordinatorClock() {
    // Inicializar con la hora actual del sistema
    const now = new Date();
    coordinatorTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
    );
    setInterval(() => {
        coordinatorTime.setSeconds(coordinatorTime.getSeconds() + 1);
    }, 1000); 
    console.log('coordinator time: ', coordinatorTime);
}

// Función para obtener la hora del coordinador
function getCoordinatorTime() {
    const hours = coordinatorTime.getHours().toString().padStart(2, '0');
    const minutes = coordinatorTime.getMinutes().toString().padStart(2, '0');
    const seconds = coordinatorTime.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

startCoordinatorClock();

// Función para enviar la hora del coordinador a los nodos Flask
function sendSystemTimeToNodes() {
    const systemTime = getCurrentTime();
    io.to('vue-clients').emit('algoritm_log', `[${systemTime}] Algoritmo de Berkeley iniciado...`);
    console.log(`[${systemTime}] Enviando hora del sistema a los nodos NODE.`);
    io.to('vue-clients').emit('algoritm_log', `[${systemTime}] Enviando hora del sistema a los nodos NODE.`);

    nodeSocketMap.forEach((socketId, nodeUrl) => {
        io.to(socketId).emit('coordinator_time', systemTime);
        console.log(`[${systemTime}] Hora del sistema [${systemTime}] enviada al nodo: ${nodeUrl}`);
        io.to('vue-clients').emit('algoritm_log', `[${systemTime}] Hora del sistema [${systemTime}] enviada al nodo: ${nodeUrl}`);
    });
}

// Escuchar la diferencia de tiempo enviada desde los nodos
io.on('connection', (socket) => {
    socket.on('time_difference', (data) => {
        const { differenceInSeconds, nodeUrl } = data;
        handleTimeDifferenceReceived(differenceInSeconds, nodeUrl);
    });
});

// Función para manejar la recepción de una diferencia de tiempo de un nodo
function handleTimeDifferenceReceived(differenceInSeconds, nodeUrl) {
    // Almacenar la diferencia de tiempo y la URL del nodo en el mapa
    nodeTimeDifferencesMap.set(nodeUrl, differenceInSeconds);

     // Imprimir las diferencias recibidas de cada nodo
     console.log(`Diferencia de tiempo recibida del nodo ${nodeUrl}: ${differenceInSeconds}`);
    // Verificar si se han recibido respuestas de todos los nodos activos
    if (nodeTimeDifferencesMap.size >= 1) { // Cambia 1 al número mínimo de nodos activos que deseas
        // Calcular el promedio de las diferencias de tiempo
        const averageDifference = calculateAverageTimeDifference();
        console.log('Promedio de diferencias de tiempo:', averageDifference);
        // Actualizar la hora actual del coordinador con el promedio de las diferencias de tiempo
        updateCoordinatorTime(averageDifference);
        // Calcular la diferencia de tiempo de cada nodo respecto al promedio
        calculateNodeTimeDifferences(averageDifference);
    }
}

// Función para calcular el promedio de las diferencias de tiempo recibidas hasta el momento
function calculateAverageTimeDifference() {
    const totalDifferenceSeconds = Array.from(nodeTimeDifferencesMap.values()).reduce((total, difference) => total + difference, 0);
    return totalDifferenceSeconds / nodeTimeDifferencesMap.size;
}

// Función para calcular la diferencia de tiempo de cada nodo respecto al promedio y enviarla al nodo correspondiente
function calculateNodeTimeDifferences(averageDifference) {
    const nodeTimeDifferences = [];
    nodeTimeDifferencesMap.forEach((difference, nodeUrl) => {
        const nodeDifference = averageDifference - difference;
        nodeTimeDifferences.push({ difference: nodeDifference, node_url: nodeUrl });
    });
    console.log('Diferencias de tiempo de cada nodo respecto al promedio:', nodeTimeDifferences);

    // Emitir las diferencias de tiempo de cada nodo respecto al promedio a los nodos correspondientes
    nodeTimeDifferences.forEach((nodeDifferences) => {
        const nodeUrl = nodeDifferences.node_url;
        const difference = nodeDifferences.difference;
        const nodeSocket = io.sockets.sockets.get(nodeSocketMap.get(nodeUrl));
        if (nodeSocket) {
            nodeSocket.emit('node_time_difference', { difference: difference });
            console.log(`Diferencia de tiempo enviada al nodo ${nodeUrl}: ${difference}`);
        } else {
            console.log(`No se encontró el socket para el nodo ${nodeUrl}.`);
        }
    });

    // Limpiar el mapa después de enviar las diferencias de tiempo
    nodeTimeDifferencesMap.clear();
}

// Función para actualizar la hora actual del coordinador sumando el promedio de las diferencias de tiempo en segundos
function updateCoordinatorTime(averageDifference) {
    const newTime = coordinatorTime.getTime() + (averageDifference * 1000);
    coordinatorTime.setTime(newTime);
    console.log('Hora actualizada del coordinador:', coordinatorTime.toLocaleString());
}

app.post('/start-berkeley', (req, res) => {
    sendSystemTimeToNodes();
    res.send('Algoritmo de Berkeley iniciado correctamente.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de WebSocket escuchando en el puerto ${PORT}`);
});
