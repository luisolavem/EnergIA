"""
Inicio de sesion y roles.

Contrasenas: se guardan con scrypt, nunca en texto plano.
Sesion: token JWT firmado con JWT_SECRETO (del .env) con el id, el rol y la version
de la cuenta. Cambiar la contrasena o el rol, o desactivar la cuenta, sube la version
y anula los tokens anteriores.
Roles: "residente" y "tecnico". main.py protege cada endpoint con usuario_actual o
requiere_tecnico.

AUTH_OBLIGATORIA=0 acepta peticiones sin token (se uso mientras se adaptaba el
frontend). En operacion normal va en 1.
"""

import base64
import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

import base_datos

log = logging.getLogger("energia.auth")

AUTH_OBLIGATORIA = os.getenv("AUTH_OBLIGATORIA", "1").strip().lower() in ("1", "true", "si", "yes")
JWT_SECRETO = os.getenv("JWT_SECRETO", "")
JWT_ALGORITMO = "HS256"
DURACION_SESION = timedelta(hours=12)
DURACION_SESION_LARGA = timedelta(days=30)   # "Mantener la sesion"
MIN_CONTRASENA = 8

# Intentos fallidos permitidos por IP y correo en la ventana de tiempo
MAX_INTENTOS = 5
VENTANA_INTENTOS_S = 15 * 60

if not JWT_SECRETO:
    JWT_SECRETO = secrets.token_urlsafe(48)
    log.warning("JWT_SECRETO no esta en el .env: se uso uno temporal. "
                "Las sesiones se cerraran cada vez que se reinicie el backend.")


# Contrasenas
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def hash_contrasena(contrasena: str) -> str:
    sal = secrets.token_bytes(16)
    h = hashlib.scrypt(contrasena.encode(), salt=sal, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64(sal)}${_b64(h)}"


def verificar_contrasena(contrasena: str, guardado: str) -> bool:
    try:
        _, n, r, p, sal, h = guardado.split("$")
        calc = hashlib.scrypt(contrasena.encode(), salt=base64.b64decode(sal), dklen=32,
                              n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(calc, base64.b64decode(h))
    except Exception:
        return False


# Se verifica contra este hash cuando el correo no existe, para que la respuesta tarde lo mismo
_HASH_FICTICIO = hash_contrasena(secrets.token_urlsafe(16))


def validar_contrasena_nueva(contrasena: str) -> None:
    if len(contrasena) < MIN_CONTRASENA:
        raise HTTPException(status_code=400, detail=f"La contraseña debe tener al menos {MIN_CONTRASENA} caracteres")


# Tokens
def crear_token(usuario: dict, recordar: bool) -> Dict[str, str]:
    vence = datetime.now(timezone.utc) + (DURACION_SESION_LARGA if recordar else DURACION_SESION)
    carga = {"sub": str(usuario["id"]), "rol": usuario["rol"], "ver": usuario["version_token"],
             "exp": vence, "iat": datetime.now(timezone.utc)}
    return {"token": jwt.encode(carga, JWT_SECRETO, algorithm=JWT_ALGORITMO), "vence": vence.isoformat()}


def usuario_desde_token(token: str) -> Optional[dict]:
    """Devuelve el usuario si el token es valido y la cuenta sigue activa; si no, None."""
    try:
        carga = jwt.decode(token, JWT_SECRETO, algorithms=[JWT_ALGORITMO])
        usuario = base_datos.buscar_por_id(int(carga["sub"]), con_hash=True)
    except Exception:
        return None
    if not usuario or not usuario["activo"] or usuario["version_token"] != carga.get("ver"):
        return None
    usuario.pop("hash", None)
    usuario["activo"] = True
    return usuario


# Usuario que se asume mientras AUTH_OBLIGATORIA=0 y la peticion no trae token
ANONIMO = {"id": 0, "correo": "", "nombre": "Sin sesion (modo transicion)", "rol": "tecnico",
           "activo": True, "version_token": 0}

_bearer = HTTPBearer(auto_error=False)


def usuario_actual(credenciales: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> dict:
    if credenciales is None:
        if not AUTH_OBLIGATORIA:
            return ANONIMO
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inicia sesión para continuar",
                            headers={"WWW-Authenticate": "Bearer"})
    usuario = usuario_desde_token(credenciales.credentials)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="La sesión venció o ya no es válida. Inicia sesión de nuevo",
                            headers={"WWW-Authenticate": "Bearer"})
    return usuario


def requiere_tecnico(usuario: dict = Depends(usuario_actual)) -> dict:
    if usuario["rol"] != "tecnico":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta sección es solo para el equipo técnico")
    return usuario


def token_websocket_valido(token: Optional[str]) -> Optional[dict]:
    """Valida el token de /ws/nodes. El navegador no envia cabeceras en un WebSocket,
    por eso el token llega como parametro (?token=...)."""
    if token:
        return usuario_desde_token(token)
    return None if AUTH_OBLIGATORIA else ANONIMO


# Limite de intentos fallidos
_fallos: Dict[str, List[float]] = {}


def _clave_intentos(request: Request, correo: str) -> str:
    ip = request.client.host if request.client else "?"
    return f"{ip}|{correo.strip().lower()}"


def _bloqueado(clave: str) -> bool:
    ahora = time.time()
    _fallos[clave] = [t for t in _fallos.get(clave, []) if ahora - t < VENTANA_INTENTOS_S]
    return len(_fallos[clave]) >= MAX_INTENTOS


# Endpoints
router = APIRouter(prefix="/api")


class Credenciales(BaseModel):
    correo: str = Field(..., max_length=120)
    contrasena: str = Field(..., max_length=200)
    recordar: bool = False


class CambioContrasena(BaseModel):
    actual: str = Field(..., max_length=200)
    nueva: str = Field(..., max_length=200)


class UsuarioNuevo(BaseModel):
    correo: str = Field(..., max_length=120, pattern=r"^[^@\s]+@[^@\s]+$")
    nombre: str = Field(..., min_length=1, max_length=60)
    rol: str = Field(..., pattern="^(residente|tecnico)$")
    contrasena: str = Field(..., max_length=200)


class UsuarioCambios(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=60)
    rol: Optional[str] = Field(None, pattern="^(residente|tecnico)$")
    activo: Optional[bool] = None


class ContrasenaNueva(BaseModel):
    contrasena: str = Field(..., max_length=200)


@router.post("/auth/login")
def iniciar_sesion(datos: Credenciales, request: Request):
    clave = _clave_intentos(request, datos.correo)
    if _bloqueado(clave):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo")
    usuario = base_datos.buscar_por_correo(datos.correo)
    ok = verificar_contrasena(datos.contrasena, usuario["hash"] if usuario else _HASH_FICTICIO)
    if not usuario or not ok or not usuario["activo"]:
        _fallos.setdefault(clave, []).append(time.time())
        raise HTTPException(status_code=401, detail="El correo o la contraseña no coinciden")
    _fallos.pop(clave, None)
    base_datos.registrar_acceso(usuario["id"])
    sesion = crear_token(usuario, datos.recordar)
    return {**sesion, "usuario": base_datos.buscar_por_id(usuario["id"])}


@router.get("/auth/yo")
def quien_soy(usuario: dict = Depends(usuario_actual)):
    """Permite al frontend comprobar si la sesion guardada sigue siendo valida."""
    return {"usuario": usuario, "auth_obligatoria": AUTH_OBLIGATORIA}


@router.post("/auth/cambiar-contrasena")
def cambiar_contrasena(datos: CambioContrasena, usuario: dict = Depends(usuario_actual)):
    if usuario["id"] == 0:
        raise HTTPException(status_code=401, detail="Inicia sesión para cambiar la contraseña")
    completo = base_datos.buscar_por_id(usuario["id"], con_hash=True)
    if not verificar_contrasena(datos.actual, completo["hash"]):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    validar_contrasena_nueva(datos.nueva)
    base_datos.cambiar_hash(usuario["id"], hash_contrasena(datos.nueva))
    # Las demas sesiones se cierran; esta recibe un token nuevo
    return crear_token(base_datos.buscar_por_id(usuario["id"], con_hash=True), recordar=True)


@router.get("/usuarios")
def listar_usuarios(_: dict = Depends(requiere_tecnico)):
    return {"usuarios": base_datos.listar()}


@router.post("/usuarios", status_code=201)
def crear_usuario(datos: UsuarioNuevo, _: dict = Depends(requiere_tecnico)):
    validar_contrasena_nueva(datos.contrasena)
    try:
        return base_datos.crear(datos.correo, datos.nombre, datos.rol, hash_contrasena(datos.contrasena))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/usuarios/{id_usuario}")
def modificar_usuario(id_usuario: int, cambios: UsuarioCambios, _: dict = Depends(requiere_tecnico)):
    actual = base_datos.buscar_por_id(id_usuario)
    if not actual:
        raise HTTPException(status_code=404, detail="La cuenta no existe")
    deja_de_ser_tecnico = actual["rol"] == "tecnico" and actual["activo"] and (
        (cambios.rol is not None and cambios.rol != "tecnico") or cambios.activo is False)
    if deja_de_ser_tecnico and base_datos.contar_tecnicos_activos() <= 1:
        raise HTTPException(status_code=400, detail="Debe quedar al menos una cuenta de técnico activa")
    return base_datos.actualizar(id_usuario, nombre=cambios.nombre, rol=cambios.rol, activo=cambios.activo)


@router.post("/usuarios/{id_usuario}/contrasena")
def restablecer_contrasena(id_usuario: int, datos: ContrasenaNueva, _: dict = Depends(requiere_tecnico)):
    if not base_datos.buscar_por_id(id_usuario):
        raise HTTPException(status_code=404, detail="La cuenta no existe")
    validar_contrasena_nueva(datos.contrasena)
    base_datos.cambiar_hash(id_usuario, hash_contrasena(datos.contrasena))
    return {"status": "ok"}
