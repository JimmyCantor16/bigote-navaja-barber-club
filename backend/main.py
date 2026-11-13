"""Sirve la landing y recibe los mensajes de su formulario de contacto.

Un solo servicio: la página (rutas relativas) y una API mínima.
- POST /api/contacto  guarda el mensaje (SQLite de la biblioteca estándar).
- GET  /api/mensajes  los lista para el dueño, con la cabecera X-Clave-Admin
  igual a la variable de entorno CLAVE_ADMIN (sin ella, la ruta no existe).
"""
from __future__ import annotations

import os
import re
import secrets
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

_RAIZ = Path(__file__).resolve().parent.parent
_FRONT = _RAIZ / "frontend"
_DB = Path(os.environ.get("CONTACTO_DB") or (_RAIZ / "data" / "contacto.db"))
_CANDADO = threading.Lock()
_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@contextmanager
def _conexion():
    """Abre, confirma y CIERRA. `with sqlite3.connect()` solo confirma: deja
    la conexión abierta y el archivo bloqueado."""
    _DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(_DB)
    try:
        con.execute(
            "CREATE TABLE IF NOT EXISTS mensajes ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,"
            " contacto TEXT NOT NULL, interes TEXT NOT NULL DEFAULT '',"
            " mensaje TEXT NOT NULL, creado_en TEXT NOT NULL)"
        )
        yield con
        con.commit()
    finally:
        con.close()


class MensajeIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    contacto: str = Field(min_length=5, max_length=120)
    mensaje: str = Field(min_length=10, max_length=2000)
    interes: str = Field(default="", max_length=120)
    # Campo trampa: invisible para personas, los robots lo rellenan.
    web: str = Field(default="", max_length=200)

    @field_validator("nombre", "mensaje", "interes")
    @classmethod
    def _limpio(cls, v: str) -> str:
        return v.strip()

    @field_validator("contacto")
    @classmethod
    def _contacto(cls, v: str) -> str:
        v = v.strip()
        if _CORREO.match(v) or ("@" not in v and len(re.sub(r"\D", "", v)) >= 7):
            return v
        raise ValueError("Escribe un correo válido o un teléfono con al menos 7 dígitos.")


app = FastAPI(title='Bigote & Navaja Barber Club')


@app.get("/api/salud")
def salud() -> dict:
    return {"ok": True}


@app.post("/api/contacto", status_code=201)
def recibir(m: MensajeIn) -> dict:
    if m.web:
        return {"ok": True}  # robot: se le contesta igual y no se guarda nada
    with _CANDADO, _conexion() as con:
        con.execute(
            "INSERT INTO mensajes (nombre, contacto, interes, mensaje, creado_en) VALUES (?,?,?,?,?)",
            (m.nombre, m.contacto, m.interes, m.mensaje,
             datetime.now(timezone.utc).isoformat(timespec="seconds")),
        )
    return {"ok": True}


@app.get("/api/mensajes")
def mensajes(x_clave_admin: str = Header(default="")) -> dict:
    clave = os.environ.get("CLAVE_ADMIN", "")
    if not clave:
        raise HTTPException(404, "Define CLAVE_ADMIN en el entorno para leer los mensajes.")
    if not secrets.compare_digest(x_clave_admin, clave):
        raise HTTPException(401, "Clave incorrecta.")
    with _conexion() as con:
        filas = con.execute(
            "SELECT id, nombre, contacto, interes, mensaje, creado_en FROM mensajes ORDER BY id DESC LIMIT 500"
        ).fetchall()
    campos = ("id", "nombre", "contacto", "interes", "mensaje", "creado_en")
    return {"total": len(filas), "mensajes": [dict(zip(campos, f)) for f in filas]}


# ===========================================================================
# Reservas en línea
# ===========================================================================
import json as _json
import logging
import smtplib
import urllib.parse
import urllib.request
from datetime import date as _date, timedelta
from email.message import EmailMessage
from typing import Optional

_log = logging.getLogger("reservas")
_NEGOCIO = _json.loads((Path(__file__).resolve().parent / "negocio.json").read_text(encoding="utf-8"))
_SERVICIOS = {s["id"]: s for s in _NEGOCIO["servicios"]}
_PROS = {p["id"]: p for p in _NEGOCIO["profesionales"]}
_AG = _NEGOCIO["agenda"]
_HORA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _zona() -> timezone:
    horas = float(os.environ.get("ZONA_HORARIA_HORAS", _NEGOCIO.get("zona_horas", -5)))
    return timezone(timedelta(hours=horas))


def _min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _hhmm(minutos: int) -> str:
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


@contextmanager
def _agenda():
    with _conexion() as con:
        con.execute(
            "CREATE TABLE IF NOT EXISTS reservas ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL,"
            " servicio TEXT NOT NULL, profesional TEXT NOT NULL, fecha TEXT NOT NULL,"
            " inicio INTEGER NOT NULL, fin INTEGER NOT NULL, nombre TEXT NOT NULL,"
            " email TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '',"
            " con_google INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'confirmada',"
            " creado_en TEXT NOT NULL)"
        )
        yield con


def _huecos(con, fecha: _date, servicio: dict, pro: str) -> dict:
    """{hora: [profesionales libres]} de ese día. Lo calcula SIEMPRE el servidor."""
    ahora = datetime.now(_zona())
    tope = ahora.date() + timedelta(days=int(_NEGOCIO.get("dias_adelante", 30)))
    if fecha.weekday() not in _AG["dias"] or fecha < ahora.date() or fecha > tope:
        return {}
    candidatos = [pro] if pro in _PROS else list(_PROS)
    ocupado = {p: con.execute(
        "SELECT inicio, fin FROM reservas WHERE fecha = ? AND profesional = ? AND estado = 'confirmada'",
        (fecha.isoformat(), p)).fetchall() for p in candidatos}
    # Hoy no se ofrece lo que ya pasó, ni lo que empieza en menos de 30 minutos.
    minimo = ahora.hour * 60 + ahora.minute + 30 if fecha == ahora.date() else -1
    dura, salida = int(servicio["duracion"]), {}
    m = _min(_AG["apertura"])
    while m + dura <= _min(_AG["cierre"]):
        if m >= minimo:
            libres = [p for p in candidatos if all(m + dura <= a or m >= b for a, b in ocupado[p])]
            if libres:
                salida[_hhmm(m)] = libres
        m += int(_AG["intervalo"])
    return salida


def _google(credencial: str) -> tuple:
    """Verifica el token de Google EN EL SERVIDOR y devuelve (nombre, correo)."""
    cliente = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    if not cliente:
        raise HTTPException(400, "El acceso con Google no está activo en esta página.")
    url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credencial)
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            datos = _json.loads(r.read().decode("utf-8"))
    except Exception:
        raise HTTPException(401, "Google no confirmó tu identidad. Inténtalo de nuevo.")
    if (datos.get("aud") != cliente or str(datos.get("email_verified")).lower() != "true"
            or datos.get("iss") not in ("accounts.google.com", "https://accounts.google.com")):
        raise HTTPException(401, "Google no confirmó tu identidad. Inténtalo de nuevo.")
    return (datos.get("name") or datos["email"].split("@")[0])[:80], datos["email"][:120]


def _correo_activo() -> bool:
    return bool(os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"))


def _enlace_calendario(r: dict) -> str:
    zona = _zona()
    dia = _date.fromisoformat(r["fecha"])
    def utc(minutos: int) -> str:
        local = datetime(dia.year, dia.month, dia.day, minutos // 60, minutos % 60, tzinfo=zona)
        return local.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    detalles = f"{r['servicio']} con {r['profesional']}. Código {r['codigo']}."
    return "https://calendar.google.com/calendar/render?" + urllib.parse.urlencode({
        "action": "TEMPLATE", "text": f"{r['servicio']} · {_NEGOCIO['nombre']}",
        "dates": f"{utc(r['inicio'])}/{utc(r['fin'])}", "details": detalles,
        "location": _NEGOCIO.get("direccion", ""),
    })


def _enviar(para: str, asunto: str, texto: str, cuerpo_html: str) -> None:
    usuario = os.environ["SMTP_USER"]
    msg = EmailMessage()
    msg["From"] = f"{_NEGOCIO['nombre']} <{usuario}>"
    msg["To"] = para
    msg["Subject"] = asunto
    msg.set_content(texto)
    msg.add_alternative(cuerpo_html, subtype="html")
    with smtplib.SMTP(os.environ.get("SMTP_HOST", "smtp.gmail.com"),
                      int(os.environ.get("SMTP_PORT", "587")), timeout=20) as s:
        s.starttls()
        s.login(usuario, os.environ["SMTP_PASSWORD"])
        s.send_message(msg)


def _avisar(r: dict) -> None:
    """Correo al cliente y al dueño. Corre en un hilo: la cita ya está guardada."""
    if not _correo_activo():
        _log.warning("Reserva %s guardada; correo sin configurar (SMTP_USER/SMTP_PASSWORD).", r["codigo"])
        return
    cuando = f"{r['fecha']} a las {_hhmm(r['inicio'])}"
    filas = "".join(
        f"<tr><td style='padding:6px 0;color:#667'>{k}</td><td style='padding:6px 0'><b>{v}</b></td></tr>"
        for k, v in (("Servicio", r["servicio"]), ("Con", r["profesional"]), ("Cuándo", cuando),
                     ("Código", r["codigo"]), ("Dónde", _NEGOCIO.get("direccion", "")))
        if v)
    def tarjeta(titulo: str, extra: str) -> str:
        return (f"<div style='font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;"
                f"border:1px solid #e5e7eb;border-radius:12px;padding:24px'>"
                f"<h2 style='margin:0 0 4px'>{titulo}</h2><p style='margin:0 0 16px;color:#667'>"
                f"{_NEGOCIO['nombre']}</p><table style='width:100%'>{filas}</table>{extra}</div>")
    try:
        _enviar(r["email"], f"Cita confirmada · {_NEGOCIO['nombre']} · {cuando}",
                f"Hola {r['nombre']}, tu cita de {r['servicio']} quedó para el {cuando}. Código {r['codigo']}.",
                tarjeta(f"¡Listo, {html_escape(r['nombre'].split()[0])}!",
                        f"<p style='margin-top:18px'><a href='{r['calendario']}'>Añadir a Google Calendar</a></p>"))
        dueno = os.environ.get("NOTIFICAR_A") or _NEGOCIO.get("email") or os.environ["SMTP_USER"]
        _enviar(dueno, f"Nueva reserva: {r['nombre']} · {cuando}",
                f"{r['nombre']} ({r['email']} {r['telefono']}) reservó {r['servicio']} el {cuando}.",
                tarjeta("Nueva reserva", f"<p>{html_escape(r['nombre'])} · {html_escape(r['email'])} · {html_escape(r['telefono'])}</p>"
                                         f"<p style='color:#667'>{html_escape(r['nota'])}</p>"))
        _log.info("Reserva %s: correos enviados.", r["codigo"])
    except Exception as exc:  # el correo nunca tumba una cita ya guardada
        _log.error("Reserva %s guardada, pero el correo falló: %s", r["codigo"], type(exc).__name__)


def html_escape(texto: str) -> str:
    return (texto or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class ReservaIn(BaseModel):
    servicio: str = Field(max_length=10)
    profesional: str = Field(default="", max_length=10)
    fecha: _date
    hora: str = Field(max_length=5)
    nombre: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=120)
    telefono: str = Field(default="", max_length=24)
    nota: str = Field(default="", max_length=500)
    credencial_google: str = Field(default="", max_length=4096)
    web: str = Field(default="", max_length=200)  # campo trampa


class CancelarIn(BaseModel):
    email: str = Field(max_length=120)


@app.get("/api/negocio")
def negocio() -> dict:
    return {
        "nombre": _NEGOCIO["nombre"], "whatsapp": _NEGOCIO.get("whatsapp", ""),
        "servicios": _NEGOCIO["servicios"], "profesionales": _NEGOCIO["profesionales"],
        "agenda": _AG, "dias_adelante": _NEGOCIO.get("dias_adelante", 30),
        "hoy": datetime.now(_zona()).date().isoformat(),
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", "").strip(),
        "correo_activo": _correo_activo(),
    }


@app.get("/api/disponibilidad")
def disponibilidad(servicio: str, fecha: _date, profesional: str = "") -> dict:
    s = _SERVICIOS.get(servicio)
    if not s:
        raise HTTPException(404, "Ese servicio no existe.")
    with _agenda() as con:
        huecos = _huecos(con, fecha, s, profesional)
    return {"fecha": fecha.isoformat(), "horas": list(huecos)}


@app.post("/api/reservas", status_code=201)
def reservar(r: ReservaIn) -> dict:
    s = _SERVICIOS.get(r.servicio)
    if not s:
        raise HTTPException(404, "Ese servicio no existe.")
    if r.profesional and r.profesional not in _PROS:
        raise HTTPException(404, "Ese profesional no existe.")
    if not _HORA.match(r.hora):
        raise HTTPException(422, "Hora inválida.")
    if r.credencial_google:
        nombre, email = _google(r.credencial_google)
    else:
        nombre, email = r.nombre.strip(), r.email.strip().lower()
        if len(nombre) < 2:
            raise HTTPException(422, "Escribe tu nombre.")
        if not _CORREO.match(email):
            raise HTTPException(422, "Escribe un correo válido.")
    telefono = r.telefono.strip()
    if telefono and len(re.sub(r"\D", "", telefono)) < 7:
        raise HTTPException(422, "El celular debe tener al menos 7 dígitos.")
    if r.web:
        raise HTTPException(422, "No se pudo reservar.")
    with _CANDADO, _agenda() as con:
        libres = _huecos(con, r.fecha, s, r.profesional).get(r.hora)
        if not libres:
            raise HTTPException(409, "Esa hora se acaba de ocupar. Elige otra, por favor.")
        pro = r.profesional or libres[0]
        codigo = "R-" + secrets.token_hex(3).upper()
        inicio = _min(r.hora)
        con.execute(
            "INSERT INTO reservas (codigo, servicio, profesional, fecha, inicio, fin, nombre, email,"
            " telefono, nota, con_google, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (codigo, s["id"], pro, r.fecha.isoformat(), inicio, inicio + int(s["duracion"]), nombre,
             email, telefono, r.nota.strip(), 1 if r.credencial_google else 0,
             datetime.now(timezone.utc).isoformat(timespec="seconds")),
        )
    salida = {
        "codigo": codigo, "servicio": s["nombre"], "precio": s.get("precio", ""),
        "duracion": s["duracion"], "profesional": _PROS[pro]["nombre"], "fecha": r.fecha.isoformat(),
        "hora": r.hora, "inicio": inicio, "fin": inicio + int(s["duracion"]), "nombre": nombre,
        "email": email, "telefono": telefono, "nota": r.nota.strip(),
        "correo": "enviando" if _correo_activo() else "sin_configurar",
    }
    salida["calendario"] = _enlace_calendario(salida)
    threading.Thread(target=_avisar, args=(dict(salida),), daemon=True).start()
    return salida


@app.post("/api/reservas/{codigo}/cancelar")
def cancelar(codigo: str, c: CancelarIn) -> dict:
    with _CANDADO, _agenda() as con:
        n = con.execute(
            "UPDATE reservas SET estado = 'cancelada' WHERE codigo = ? AND lower(email) = ? AND estado = 'confirmada'",
            (codigo.strip().upper(), c.email.strip().lower())).rowcount
    if not n:
        raise HTTPException(404, "No encontramos una cita activa con ese código y correo.")
    return {"ok": True}


@app.get("/api/reservas")
def reservas(x_clave_admin: str = Header(default=""), fecha: Optional[_date] = None) -> dict:
    clave = os.environ.get("CLAVE_ADMIN", "")
    if not clave:
        raise HTTPException(404, "Define CLAVE_ADMIN en el entorno para ver la agenda.")
    if not secrets.compare_digest(x_clave_admin, clave):
        raise HTTPException(401, "Clave incorrecta.")
    filtro, args = ("WHERE fecha = ?", (fecha.isoformat(),)) if fecha else ("", ())
    with _agenda() as con:
        filas = con.execute(
            "SELECT codigo, servicio, profesional, fecha, inicio, fin, nombre, email, telefono, nota, estado"
            f" FROM reservas {filtro} ORDER BY fecha, inicio LIMIT 1000", args).fetchall()
    return {"total": len(filas), "reservas": [{
        "codigo": f[0], "servicio": _SERVICIOS.get(f[1], {}).get("nombre", f[1]),
        "profesional": _PROS.get(f[2], {}).get("nombre", f[2]), "fecha": f[3], "hora": _hhmm(f[4]),
        "fin": _hhmm(f[5]), "nombre": f[6], "email": f[7], "telefono": f[8], "nota": f[9], "estado": f[10],
    } for f in filas]}


@app.get("/reservar")
def pagina_reservar():
    return FileResponse(str(_FRONT / "reservar.html"))


app.mount("/static", StaticFiles(directory=str(_FRONT)), name="static")


@app.get("/")
def index():
    return FileResponse(str(_FRONT / "index.html"))
