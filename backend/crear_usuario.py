"""
Administracion de las cuentas del dashboard desde la terminal.

Uso (desde la carpeta del backend, con el entorno virtual activo):
  python crear_usuario.py crear --correo tecnico@energia.local --nombre "Tecnico" --rol tecnico
  python crear_usuario.py crear --correo hogar@energia.local --nombre "Hogar" --rol residente
  python crear_usuario.py listar
  python crear_usuario.py contrasena --correo hogar@energia.local
  python crear_usuario.py desactivar --correo hogar@energia.local
  python crear_usuario.py activar --correo hogar@energia.local

La contrasena se pide por teclado sin mostrarse, para que no quede en el historial.
Un tecnico puede hacer lo mismo desde el dashboard, en Configuracion > Usuarios.
"""

import argparse
import getpass
import os
import sys
from pathlib import Path


def cargar_env() -> None:
    ruta = Path(__file__).with_name(".env")
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            clave, valor = linea.split("=", 1)
            os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


cargar_env()
import base_datos  # noqa: E402  (se importa despues de leer el .env por RUTA_BD)
from auth import MIN_CONTRASENA, hash_contrasena  # noqa: E402


def pedir_contrasena() -> str:
    while True:
        c1 = getpass.getpass("Contraseña nueva: ")
        if len(c1) < MIN_CONTRASENA:
            print(f"Debe tener al menos {MIN_CONTRASENA} caracteres.")
            continue
        if c1 != getpass.getpass("Repítela: "):
            print("No coinciden. Inténtalo de nuevo.")
            continue
        return c1


def cuenta(correo: str) -> dict:
    u = base_datos.buscar_por_correo(correo)
    if not u:
        sys.exit(f"No existe una cuenta con el correo {correo}")
    return u


def main() -> None:
    p = argparse.ArgumentParser(description="Cuentas de EnergIA")
    sub = p.add_subparsers(dest="accion", required=True)
    c = sub.add_parser("crear", help="crear una cuenta")
    c.add_argument("--correo", required=True)
    c.add_argument("--nombre", required=True)
    c.add_argument("--rol", required=True, choices=["residente", "tecnico"])
    sub.add_parser("listar", help="ver las cuentas")
    for accion in ("contrasena", "desactivar", "activar"):
        s = sub.add_parser(accion)
        s.add_argument("--correo", required=True)
    a = p.parse_args()

    base_datos.iniciar()

    if a.accion == "crear":
        try:
            u = base_datos.crear(a.correo, a.nombre, a.rol, hash_contrasena(pedir_contrasena()))
        except ValueError as e:
            sys.exit(str(e))
        print(f"Cuenta creada: {u['correo']} ({u['rol']})")

    elif a.accion == "listar":
        usuarios = base_datos.listar()
        if not usuarios:
            print("No hay cuentas. Crea la primera con: python crear_usuario.py crear ... --rol tecnico")
        for u in usuarios:
            estado = "activa" if u["activo"] else "desactivada"
            print(f"{u['id']:>3}  {u['correo']:<32} {u['nombre']:<24} {u['rol']:<10} {estado:<12} "
                  f"último acceso: {u['ultimo_acceso'] or 'nunca'}")

    elif a.accion == "contrasena":
        u = cuenta(a.correo)
        base_datos.cambiar_hash(u["id"], hash_contrasena(pedir_contrasena()))
        print("Contraseña cambiada. Las sesiones abiertas de esa cuenta se cerraron.")

    elif a.accion in ("desactivar", "activar"):
        u = cuenta(a.correo)
        base_datos.actualizar(u["id"], activo=(a.accion == "activar"))
        print(f"Cuenta {a.correo} {'activada' if a.accion == 'activar' else 'desactivada'}.")


if __name__ == "__main__":
    main()
