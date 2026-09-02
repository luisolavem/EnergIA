# Energy Monitor IoT — MVP

Monitoreo de consumo energético residencial en tiempo real, con 5 nodos simulados.

## Estructura

```
energy-monitor/
├── backend/
│   ├── main.py            # API FastAPI (REST + WebSocket)
│   ├── simulator.py        # Simula los 5 nodos enviando datos cada 2s
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   ├── index.css
    │   └── components/
    │       ├── NodeCard.jsx
    │       └── EnergyChart.jsx
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── postcss.config.js
```

## Cómo correrlo (3 terminales)

**1. Backend**
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Simulador de nodos** (en otra terminal, con el venv activo)
```bash
cd backend
source venv/bin/activate
python simulator.py
```

**3. Frontend**
```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`. Verás las 5 tarjetas de nodos actualizándose y el gráfico de potencia en vivo.

## Endpoints del backend

| Método | Ruta                     | Descripción                                  |
|--------|--------------------------|-----------------------------------------------|
| POST   | `/api/nodes/data`        | Un nodo envía su lectura (voltage/current/power) |
| GET    | `/api/nodes/data`        | Última lectura de los 5 nodos                 |
| GET    | `/api/nodes/{node_id}/data` | Última lectura de un nodo específico       |
| WS     | `/ws/nodes`               | Push en tiempo real de cada actualización     |

Docs interactivas de la API: `http://localhost:8000/docs`

## Próximos pasos (escalado futuro)

- Persistencia real (Postgres/TimescaleDB/InfluxDB) en vez de memoria.
- Autenticación de nodos (API key por dispositivo).
- Endpoint de históricos con filtros por rango de fecha.
- Modelo de IA: detección de anomalías / predicción de consumo sobre la serie temporal ya capturada.
- Sustituir `simulator.py` por los nodos ESP32/Arduino reales publicando al mismo endpoint.
