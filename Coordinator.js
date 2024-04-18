const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const ioClient = require('socket.io-client');

app.use(cors());

io.on('connection', (socket) => {
    console.log('Nuevo cliente conectado');

    // Manejar el evento de cierre del socket
    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
        // Realizar alguna acción cuando un cliente se desconecte, si es necesario
    });
});


// Lista de URLs de los nodos Flask
const nodes = [ "http://localhost:5002", // Ejemplo de URL del primer nodo Flask
    // Agrega más URLs de nodos Flask según sea necesario
];

// Función para realizar el ping a un nodo Flask
function pingNode(nodeUrl) {
    const socket = ioClient.connect(nodeUrl);

    socket.on('connect', () => {
        console.log(`Ping a ${nodeUrl}: Conectado`);
        // Puedes actualizar el estado del nodo como conectado en tu lista de nodos
    });

    socket.on('connect_error', (error) => {
        console.log(`Ping a ${nodeUrl}: Error de conexión - ${error.message}`);
        // Puedes actualizar el estado del nodo como desconectado en tu lista de nodos
    });
}

// Realizar el ping a cada nodo en la lista
nodes.forEach((nodeUrl) => {
    pingNode(nodeUrl);
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de WebSocket escuchando en el puerto ${PORT}`);
});
