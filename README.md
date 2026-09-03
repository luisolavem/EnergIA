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

Abrir `http://localhost:5173`.

## Endpoints del backend

| Método | Ruta                     | Descripción                                  |
|--------|--------------------------|-----------------------------------------------|
| POST   | `/api/nodes/data`        | Un nodo envía su lectura (voltage/current/power) |
| GET    | `/api/nodes/data`        | Última lectura de los 5 nodos                 |
| GET    | `/api/nodes/{node_id}/data` | Última lectura de un nodo específico       |
| WS     | `/ws/nodes`               | Push en tiempo real de cada actualización     |
