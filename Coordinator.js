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

let nodeTimeDifferences = []; // Declárala aquí junto con las otras variables globales


// Lista para almacenar las diferencias de tiempo recibidas del nodo Flask
const timeDifferences = [];

// Mapa para guardar la relación entre nodo y socket ID
const nodeSocketMap = new Map();

const flaskSockets = [
    socketIoClient.connect('http://localhost:5001'),
    socketIoClient.connect('http://localhost:5002'),
    socketIoClient.connect('http://localhost:5003')
];

const nodes = ['http://localhost:5001', 'http://localhost:5002', 'http://localhost:5003'];

function getCurrentTime() {
    return new Date().toLocaleTimeString();
}

io.on('connection', (socket) => {
    const origin = socket.handshake.headers.origin;

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

// implementación berkeley

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
    const systemTime = getCoordinatorTime();
    io.to('vue-clients').emit('algoritm_log', `[${systemTime}] Algoritmo de Berkeley iniciado...`);
    console.log(`[${systemTime}] Enviando hora del sistema a los nodos Flask.`);
    io.to('vue-clients').emit('algoritm_log', `[${systemTime}] Enviando hora del sistema a los nodos Flask.`);

    flaskSockets.forEach((flaskSocket, index) => {
        flaskSocket.emit('coordinator_time', systemTime);
        console.log(`[${systemTime}] Hora del sistema enviada al nodo ${index + 1}: ${systemTime}`);
        io.to('vue-clients').emit('algoritm_log', `[${systemTime}] Hora del sistema enviada al nodo ${index + 1}: ${systemTime}`);
    });
}

// Escuchar la diferencia de tiempo enviada desde los nodos Flask
flaskSockets.forEach((flaskSocket, index) => {
    flaskSocket.on('time_difference', (data) => {
        const differenceSeconds = data.difference;
        const nodeUrl = data.node_url; // Obtener la URL del nodo Flask
        console.log(`Diferencia de tiempo recibida desde Flask ${index + 1} (${nodeUrl}): ${differenceSeconds} segundos`);

        // Almacenar la diferencia de tiempo y la URL del nodo Flask en la lista
        timeDifferences.push({ difference: differenceSeconds, node_url: nodeUrl });
        console.log('Lista de diferencias de tiempo:', timeDifferences);

        // Incrementar el contador de diferencias de tiempo recibidas
        receivedTimeDifferenceCount++;

        // Verificar si se han recibido todas las diferencias de tiempo esperadas
        if (receivedTimeDifferenceCount === flaskSockets.length) {
            // Calcular el promedio de las diferencias de tiempo
            const averageDifference = calculateAverageTimeDifference();
            // Actualizar la hora actual del coordinador con el promedio de las diferencias de tiempo
            updateCoordinatorTime(averageDifference);
            // Calcular la diferencia de tiempo de cada nodo respecto al promedio
            calculateNodeTimeDifferences(averageDifference);

            // Reiniciar el contador de diferencias de tiempo recibidas
            receivedTimeDifferenceCount = 0;
        }
    });
});

// Función para calcular el promedio de las diferencias de tiempo
function calculateAverageTimeDifference() {
    // Verificar si hay diferencias de tiempo en la lista
    if (timeDifferences.length === 0) {
        console.log('No hay diferencias de tiempo para calcular el promedio.');
        return;
    }

    // Sumar todas las diferencias de tiempo
    const totalDifferenceSeconds = timeDifferences.reduce((total, difference) => total + difference.difference, 0);

    // Calcular el promedio dividiendo la suma total por el número de diferencias + 1
    const averageDifference = totalDifferenceSeconds / (timeDifferences.length + 1);

    console.log('Promedio de diferencias de tiempo:', averageDifference);

    // Guardar el promedio en una variable si es necesario
    return averageDifference;
}

// Función para calcular la diferencia de tiempo de cada nodo respecto al promedio y enviarla al nodo correspondiente
function calculateNodeTimeDifferences(averageDifference) {
    // Verificar si hay diferencias de tiempo en la lista
    if (timeDifferences.length === 0) {
        console.log('No hay diferencias de tiempo para calcular las diferencias de nodos.');
        return;
    }
    // Crear una lista para almacenar las diferencias de cada nodo respecto al promedio
    const nodeTimeDifferences = [];
    // Iterar sobre cada diferencia de tiempo y calcular la diferencia respecto al promedio
    timeDifferences.forEach((difference) => {
        const nodeDifference = averageDifference - difference.difference;
        const nodeUrl = difference.node_url;
        nodeTimeDifferences.push({ difference: nodeDifference, node_url: nodeUrl });
    });
    console.log('Diferencias de tiempo de cada nodo respecto al promedio:', nodeTimeDifferences);
    // Emitir las diferencias de tiempo de cada nodo respecto al promedio a los nodos correspondientes
    nodeTimeDifferences.forEach((nodeDifferences) => {
        const nodeUrl = nodeDifferences.node_url;
        const difference = nodeDifferences.difference;
        // Buscar el socket del nodo en la lista de sockets de Flask
        const flaskSocket = flaskSockets.find((socket) => socket.io.uri === nodeUrl);
        if (flaskSocket) {
            // Enviar la diferencia de tiempo calculada respecto al promedio
            flaskSocket.emit('node_time_difference', { difference: difference });
            console.log('Diferencia de tiempo enviada al nodo ${nodeUrl}: ${difference}');
        } else {
            console.log('No se encontró el socket para el nodo ${nodeUrl}.');
        }
    });

    setTimeout(clearValues, 10000);
}

function clearValues() {
    // Restablecer los valores a su estado inicial
    receivedTimeDifferenceCount = 0;
    timeDifferences.length = 0;
    nodeTimeDifferences.length = 0;

    console.log('Valores limpiados después de 10 segundos.');
}

// Función para actualizar la hora actual del coordinador sumando el promedio de las diferencias de tiempo en segundos
function updateCoordinatorTime(averageDifference) {
    console.log("----------------------" + coordinatorTime)
    // Convertir el promedio de las diferencias de tiempo a milisegundos y sumarlo a la hora actual del coordinador
    const newTime = coordinatorTime.getTime() + (averageDifference * 1000); // Convertir segundos a milisegundos

    console.log(averageDifference * 1000 + "------------> milisegundos a sumar")
    // Establecer la nueva hora del coordinador
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
