"""
Energy Monitor API - MVP
-------------------------
FastAPI backend que recibe lecturas de 5 nodos IoT (voltaje, corriente, potencia)
y las expone al frontend por REST y WebSocket en tiempo real.

Ejecutar:
    uvicorn main:app --reload --port 8000
"""

from datetime import datetime, timezone
from typing import Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Energy Monitor API", version="0.1.0")

# En un MVP local, permitir cualquier origen simplifica el desarrollo.
# En producción, restringe esto al dominio real del frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------
class NodeReading(BaseModel):
    """Payload que envía cada nodo IoT (o el simulador)."""
    node_id: str = Field(..., examples=["node_1"])
    voltage: float = Field(..., gt=0, description="Voltios (V)")
    current: float = Field(..., ge=0, description="Amperios (A)")
    power: float = Field(..., ge=0, description="Vatios (W)")


class NodeData(NodeReading):
    """Lectura almacenada con timestamp del servidor."""
    timestamp: str


# ---------------------------------------------------------------------------
# Almacenamiento en memoria (suficiente para el MVP; luego se puede
# reemplazar por una base de datos como TimescaleDB / InfluxDB / Postgres)
# ---------------------------------------------------------------------------
NODE_IDS = [f"node_{i}" for i in range(1, 6)]
latest_readings: Dict[str, NodeData] = {}


# ---------------------------------------------------------------------------
# Gestor de conexiones WebSocket
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        stale: List[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Endpoints REST
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"status": "ok", "message": "Energy Monitor API funcionando"}


@app.post("/api/nodes/data", response_model=dict)
async def receive_node_data(reading: NodeReading):
    """Endpoint donde los 5 nodos (o el simulador) publican sus lecturas."""
    data = NodeData(
        node_id=reading.node_id,
        voltage=reading.voltage,
        current=reading.current,
        power=reading.power,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    latest_readings[reading.node_id] = data

    # Empuja la actualización a todos los clientes conectados en tiempo real
    await manager.broadcast({"type": "update", "data": data.model_dump()})

    return {"status": "received", "node_id": reading.node_id}


@app.get("/api/nodes/data")
def get_all_nodes():
    """El frontend consulta esto para obtener el último estado de los 5 nodos."""
    return {
        "nodes": [
            latest_readings[node_id].model_dump()
            for node_id in NODE_IDS
            if node_id in latest_readings
        ]
    }


@app.get("/api/nodes/{node_id}/data")
def get_node(node_id: str):
    if node_id not in latest_readings:
        return {"error": f"aún no hay datos para '{node_id}'"}
    return latest_readings[node_id].model_dump()


# ---------------------------------------------------------------------------
# WebSocket en tiempo real
# ---------------------------------------------------------------------------
@app.websocket("/ws/nodes")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Al conectar, envía el snapshot actual para pintar la UI de inmediato
        await websocket.send_json({
            "type": "snapshot",
            "data": [latest_readings[n].model_dump() for n in NODE_IDS if n in latest_readings],
        })
        while True:
            # No esperamos nada del cliente, solo mantenemos la conexión viva
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
