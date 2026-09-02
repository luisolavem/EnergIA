"""
Simulador de 5 nodos IoT de consumo energético residencial.

Envía lecturas aleatorias (voltaje, corriente, potencia) al backend
cada 2 segundos, imitando lo que harían los sensores reales.

Ejecutar (con el backend ya corriendo en el puerto 8000):
    python simulator.py
"""

import random
import time

import requests

API_URL = "http://localhost:8000/api/nodes/data"
NODE_IDS = [f"node_{i}" for i in range(1, 6)]
INTERVAL_SECONDS = 2


def simulate_reading(node_id: str) -> dict:
    voltage = round(random.uniform(110, 125), 2)   # Red residencial típica
    current = round(random.uniform(0.5, 8.0), 2)   # Consumo variable por nodo
    power = round(voltage * current, 2)             # P = V * I
    return {
        "node_id": node_id,
        "voltage": voltage,
        "current": current,
        "power": power,
    }


def main() -> None:
    print(f"Simulando {len(NODE_IDS)} nodos IoT contra {API_URL}")
    print("Presiona Ctrl+C para detener.\n")

    while True:
        for node_id in NODE_IDS:
            payload = simulate_reading(node_id)
            try:
                response = requests.post(API_URL, json=payload, timeout=3)
                print(f"[{node_id}] -> {payload}  (status={response.status_code})")
            except requests.exceptions.RequestException as error:
                print(f"[{node_id}] ERROR al enviar datos: {error}")
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nSimulación detenida.")
