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

// Contador para realizar un seguimiento del número de diferencias de tiempo recibidas desde los nodos
let receivedTimeDifferenceCount = 0;


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

// Escuchar la diferencia de tiempo enviada desde los nodos Flask

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
    nodeTimeDifferences.forEach((nodeDifference) => {
        const nodeUrl = nodeDifference.node_url;
        const difference = nodeDifference.difference;
        // Enviar la diferencia de tiempo al nodo correspondiente
        const nodeSocket = flaskSockets.find((socket) => socket.io.uri === nodeUrl);
        if (nodeSocket) {
            // Enviar la diferencia de tiempo calculada respecto al promedio
            nodeSocket.emit('node_time_difference', { difference: difference });
            console.log(`Diferencia de tiempo enviada al nodo ${nodeUrl}: ${difference}`);
        } else {
            console.log(`No se encontró el socket para el nodo ${nodeUrl}.`);
        }
    });
}


// Función para actualizar la hora actual del coordinador sumando el promedio de las diferencias de tiempo en segundos
function updateCoordinatorTime(averageDifference) {
    // Obtener la hora actual del coordinador
    const currentCoordinatorTime = new Date();
    
    // Convertir el promedio de las diferencias de tiempo a milisegundos y sumarlo a la hora actual del coordinador
    const newTime = currentCoordinatorTime.getTime() + (averageDifference * 1000); // Convertir segundos a milisegundos
    
    // Establecer la nueva hora del coordinador
    currentCoordinatorTime.setTime(newTime);
    
    console.log('Hora actualizada del coordinador:', currentCoordinatorTime.toLocaleString());
    // Calcular la diferencia de tiempo de cada nodo respecto al promedio
    calculateNodeTimeDifferences(averageDifference);
}


app.post('/start-berkeley', (req, res) => {
    sendSystemTimeToNodes();
    res.send('Algoritmo de Berkeley iniciado correctamente.');
});



// Escuchar en el puerto definido por el entorno o por defecto a 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de WebSocket escuchando en el puerto ${PORT}`);
});
