"""
Base de datos local (SQLite) con las cuentas de usuario.

Las mediciones se guardan en InfluxDB; aqui solo va lo que no es una serie de tiempo.
El archivo energia.db se crea junto a main.py al arrancar por primera vez, o en la
ruta indicada por RUTA_BD.
"""

import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

RUTA_BD = Path(os.getenv("RUTA_BD", str(Path(__file__).with_name("energia.db"))))
ROLES = ("residente", "tecnico")

_candado = threading.Lock()


def _conectar() -> sqlite3.Connection:
    con = sqlite3.connect(RUTA_BD, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")   # menor riesgo de corrupcion ante cortes de energia
    con.execute("PRAGMA foreign_keys=ON")
    return con


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def iniciar() -> None:
    """Crea las tablas si no existen. Se llama al arrancar el backend."""
    with _candado, _conectar() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            correo         TEXT NOT NULL UNIQUE COLLATE NOCASE,
            nombre         TEXT NOT NULL,
            rol            TEXT NOT NULL CHECK (rol IN ('residente', 'tecnico')),
            hash           TEXT NOT NULL,
            activo         INTEGER NOT NULL DEFAULT 1,
            version_token  INTEGER NOT NULL DEFAULT 1,
            creado         TEXT NOT NULL,
            ultimo_acceso  TEXT
        );
        """)


def _publico(fila: Optional[sqlite3.Row]) -> Optional[dict]:
    """Datos de un usuario sin el hash de la contrasena."""
    if fila is None:
        return None
    d = dict(fila)
    d.pop("hash", None)
    d["activo"] = bool(d["activo"])
    return d


def buscar_por_correo(correo: str) -> Optional[dict]:
    """Incluye el hash: solo para verificar la contrasena al iniciar sesion."""
    with _conectar() as con:
        fila = con.execute("SELECT * FROM usuarios WHERE correo = ?", (correo.strip(),)).fetchone()
    return dict(fila) if fila else None


def buscar_por_id(id_usuario: int, con_hash: bool = False) -> Optional[dict]:
    with _conectar() as con:
        fila = con.execute("SELECT * FROM usuarios WHERE id = ?", (id_usuario,)).fetchone()
    if fila is None:
        return None
    return dict(fila) if con_hash else _publico(fila)


def listar() -> List[dict]:
    with _conectar() as con:
        filas = con.execute("SELECT * FROM usuarios ORDER BY rol DESC, nombre").fetchall()
    return [_publico(f) for f in filas]


def contar_tecnicos_activos() -> int:
    with _conectar() as con:
        return con.execute("SELECT COUNT(*) FROM usuarios WHERE rol = 'tecnico' AND activo = 1").fetchone()[0]


def crear(correo: str, nombre: str, rol: str, hash_contrasena: str) -> dict:
    if rol not in ROLES:
        raise ValueError(f"Rol invalido: {rol}")
    with _candado, _conectar() as con:
        try:
            cur = con.execute(
                "INSERT INTO usuarios (correo, nombre, rol, hash, creado) VALUES (?, ?, ?, ?, ?)",
                (correo.strip().lower(), nombre.strip(), rol, hash_contrasena, _ahora()))
        except sqlite3.IntegrityError:
            raise ValueError("Ya existe una cuenta con ese correo")
        nuevo = cur.lastrowid
    return buscar_por_id(nuevo)


def actualizar(id_usuario: int, *, nombre: Optional[str] = None, rol: Optional[str] = None,
               activo: Optional[bool] = None) -> Optional[dict]:
    """Cambiar el rol o desactivar la cuenta invalida las sesiones abiertas."""
    cambios, valores, invalidar = [], [], False
    if nombre is not None:
        cambios.append("nombre = ?"); valores.append(nombre.strip())
    if rol is not None:
        if rol not in ROLES:
            raise ValueError(f"Rol invalido: {rol}")
        cambios.append("rol = ?"); valores.append(rol); invalidar = True
    if activo is not None:
        cambios.append("activo = ?"); valores.append(1 if activo else 0); invalidar = True
    if invalidar:
        cambios.append("version_token = version_token + 1")
    if cambios:
        with _candado, _conectar() as con:
            con.execute(f"UPDATE usuarios SET {', '.join(cambios)} WHERE id = ?", (*valores, id_usuario))
    return buscar_por_id(id_usuario)


def cambiar_hash(id_usuario: int, hash_contrasena: str) -> None:
    """Nueva contrasena: cierra todas las sesiones de esa cuenta."""
    with _candado, _conectar() as con:
        con.execute("UPDATE usuarios SET hash = ?, version_token = version_token + 1 WHERE id = ?",
                    (hash_contrasena, id_usuario))


def registrar_acceso(id_usuario: int) -> None:
    with _candado, _conectar() as con:
        con.execute("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?", (_ahora(), id_usuario))
